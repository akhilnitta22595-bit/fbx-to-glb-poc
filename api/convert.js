const axios = require('axios');
const fbx2gltf = require('fbx2gltf');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // 1. Accept URL from GET query strings or POST request bodies
    const fbxUrl = req.query.fbxUrl || (req.body && req.body.fbxUrl);
    
    if (!fbxUrl) {
        return res.status(400).json({ error: 'Missing fbxUrl parameter' });
    }

    // Define transient workspace paths inside the serverless write-allowed /tmp directory
    const inputFbx = path.join('/tmp', `model_${Date.now()}.fbx`);
    const outputGlb = path.join('/tmp', `model_${Date.now()}.glb`);

    try {
        // 2. Stream the FBX source file into serverless temporary memory
        const response = await axios({ url: fbxUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(inputFbx);
        response.data.pipe(writer);

        writer.on('finish', () => {
            // 3. Convert the downloaded binary directly into GLB layout
            fbx2gltf(inputFbx, outputGlb, (error) => {
                if (error) {
                    cleanup(inputFbx, outputGlb);
                    return res.status(500).json({ error: `Conversion failed: ${error.message}` });
                }

                // 4. Inject 3D response headers so the web platform treats the endpoint as a GLB asset
                res.setHeader('Content-Type', 'model/gltf-binary');
                res.setHeader('Content-Disposition', 'attachment; filename="converted.glb"');
                
                // 5. Pipe out the generated file payload
                const readStream = fs.createReadStream(outputGlb);
                readStream.pipe(res);

                // Clean up workspace after the stream concludes
                readStream.on('end', () => {
                    cleanup(inputFbx, outputGlb);
                });
            });
        });

    } catch (err) {
        cleanup(inputFbx, outputGlb);
        return res.status(500).json({ error: `Network issue reading source file: ${err.message}` });
    }
};

function cleanup(fbxPath, glbPath) {
    if (fs.existsSync(fbxPath)) fs.unlinkSync(fbxPath);
    if (fs.existsSync(glbPath)) fs.unlinkSync(glbPath);
}
