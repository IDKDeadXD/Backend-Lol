const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Express server setup
const app = express();

// Configure multer to maintain folder structure
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join('uploads', path.dirname(file.originalname));
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, path.basename(file.originalname));
    }
});

const upload = multer({ storage });

// Middleware
app.use(cors());
app.use(express.json());

// Main endpoint for obfuscating files
app.post('/api/obfuscate-folder', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('obfuscated_scripts.zip');
    archive.pipe(res);

    try {
        for (const file of req.files) {
            try {
                // Read the source file content
                const sourceCode = fs.readFileSync(file.path, 'utf8');

                // Obfuscate the code using javascript-obfuscator
                const obfuscatedCode = JavaScriptObfuscator.obfuscate(sourceCode, {
                    compact: true,
                    controlFlowFlattening: true,
                    deadCodeInjection: true,
                    stringArray: true,
                    stringArrayEncoding: ['base64'],
                    stringArrayThreshold: 0.75,
                }).getObfuscatedCode();

                // Use the original file path (including folders) for the archive
                const relativePath = file.originalname; // This includes the folder structure
                archive.append(obfuscatedCode, { name: relativePath });

                // Clean up the uploaded file
                fs.unlinkSync(file.path);
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error.message);
            }
        }

        // Finalize the archive and send the response
        await archive.finalize();

        // Clean up the uploads directory
        const uploadsDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadsDir)) {
            fs.rmSync(uploadsDir, { recursive: true, force: true });
        }
    } catch (error) {
        console.error('Obfuscation error:', error);
        res.status(500).json({ error: `Failed to obfuscate files: ${error.message}` });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
