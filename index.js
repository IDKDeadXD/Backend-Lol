const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

// Express server setup
const app = express();

// Configure multer to handle file uploads
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
app.use(cors());
app.use(express.json());

// Simple custom obfuscator
function customObfuscator(code) {
    // Example: Basic variable renaming
    let varCounter = 0;
    const variableMap = {};

    // Match variable declarations (var, let, const)
    code = code.replace(/\b(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, (match, type, varName) => {
        if (!variableMap[varName]) {
            variableMap[varName] = `v${varCounter++}`;
        }
        return `${type} ${variableMap[varName]}`;
    });

    // Replace variable usage
    for (const [original, obfuscated] of Object.entries(variableMap)) {
        const regex = new RegExp(`\\b${original}\\b`, 'g');
        code = code.replace(regex, obfuscated);
    }

    // Encode strings (basic hexadecimal encoding)
    code = code.replace(/(["'`])((?:\\.|[^\1])*?)\1/g, (match, quote, string) => {
        const encoded = Buffer.from(string).toString('hex');
        return `${quote}\\x${encoded}${quote}`;
    });

    // Remove unnecessary whitespace
    code = code.replace(/\s+/g, ' ').trim();

    return code;
}

// Main endpoint for obfuscation
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

                // Obfuscate the code using the custom obfuscator
                const obfuscatedCode = customObfuscator(sourceCode);

                // Use the original file path (including folders) for the archive
                const relativePath = file.originalname; // Includes folder structure
                archive.append(obfuscatedCode, { name: relativePath });

                // Clean up the uploaded file
                fs.unlinkSync(file.path);
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error.message);
            }
        }

        // Finalize the archive
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
