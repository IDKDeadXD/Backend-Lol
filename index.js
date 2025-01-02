const express = require('express');
const multer = require('multer');
const cors = require('cors');
const JavaScriptObfuscator = require('javascript-obfuscator');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

app.post('/api/obfuscate-folder', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    res.attachment('obfuscated_scripts.zip');
    archive.pipe(res);

    try {
        for (const file of req.files) {
            const sourceCode = fs.readFileSync(file.path, 'utf8');
            
            const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.75,
                deadCodeInjection: true,
                deadCodeInjectionThreshold: 0.4,
                debugProtection: true,
                debugProtectionInterval: 2000,
                disableConsoleOutput: true,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                renameGlobals: false,
                rotateStringArray: true,
                selfDefending: true,
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayThreshold: 0.75,
                unicodeEscapeSequence: false
            });

            // Maintain the original file structure
            archive.append(obfuscationResult.getObfuscatedCode(), {
                name: file.originalname
            });

            // Clean up the uploaded file
            fs.unlinkSync(file.path);
        }

        archive.finalize();
    } catch (error) {
        console.error('Obfuscation error:', error);
        res.status(500).json({ error: 'Failed to obfuscate files' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});