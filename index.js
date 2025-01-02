const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const crypto = require('crypto');

// Quick Obfuscator class definition
class QuickObfuscator {
    constructor(options = {}) {
        this.options = {
            encodeStrings: true,
            renameVariables: true,
            addNoiseVariables: true,
            ...options
        };
        this.variableMap = new Map();
    }

    generateVariableName() {
        return '_' + crypto.randomBytes(4).toString('hex');
    }

    encodeString(str) {
        const base64 = Buffer.from(str).toString('base64');
        return `Buffer.from('${base64}', 'base64').toString()`;
    }

    addNoiseVariables(code) {
        const noiseVars = Array(5).fill(0).map(() => {
            const varName = this.generateVariableName();
            const randomValue = crypto.randomBytes(4).toString('hex');
            return `var ${varName}='${randomValue}';`;
        }).join('');
        return noiseVars + code;
    }

    renameVariables(code) {
        const varRegex = /\b(?:let|var|const)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)\b/g;
        let match;
        
        while ((match = varRegex.exec(code)) !== null) {
            const originalName = match[1];
            if (!this.variableMap.has(originalName)) {
                this.variableMap.set(originalName, this.generateVariableName());
            }
        }

        let obfuscatedCode = code;
        this.variableMap.forEach((newName, oldName) => {
            const regex = new RegExp(`\\b${oldName}\\b`, 'g');
            obfuscatedCode = obfuscatedCode.replace(regex, newName);
        });

        return obfuscatedCode;
    }

    encodeStrings(code) {
        return code.replace(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"/g, (match) => {
            const str = match.slice(1, -1);
            return this.encodeString(str);
        });
    }

    obfuscate(sourceCode) {
        let obfuscatedCode = sourceCode;

        if (this.options.renameVariables) {
            obfuscatedCode = this.renameVariables(obfuscatedCode);
        }

        if (this.options.encodeStrings) {
            obfuscatedCode = this.encodeStrings(obfuscatedCode);
        }

        if (this.options.addNoiseVariables) {
            obfuscatedCode = this.addNoiseVariables(obfuscatedCode);
        }

        obfuscatedCode = `(function(){${obfuscatedCode}})();`;

        return obfuscatedCode;
    }
}

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

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    res.attachment('obfuscated_scripts.zip');
    archive.pipe(res);

    try {
        const obfuscator = new QuickObfuscator({
            encodeStrings: true,
            renameVariables: true,
            addNoiseVariables: true
        });

        // Process files while maintaining directory structure
        for (const file of req.files) {
            const sourceCode = fs.readFileSync(file.path, 'utf8');
            const obfuscatedCode = obfuscator.obfuscate(sourceCode);

            // Use originalname to maintain the folder structure in the zip
            archive.append(obfuscatedCode, {
                name: file.originalname // This preserves the full path
            });

            // Clean up the uploaded file
            fs.unlinkSync(file.path);
        }

        // Clean up the uploads directory after all files are processed
        const uploadsDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadsDir)) {
            fs.rmSync(uploadsDir, { recursive: true, force: true });
        }

        archive.finalize();
    } catch (error) {
        console.error('Obfuscation error:', error);
        res.status(500).json({ error: 'Failed to obfuscate files' });
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