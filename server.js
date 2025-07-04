require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const AWS = require('aws-sdk');
const swaggerDocs = require('./swagger');
const { logInfo, logError } = require('./logger');
const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: '*'
}));

app.use(express.json());

/**
 * @swagger
 * tags:
 *   - name: CRUD MongoDb
 *     description: Operações de CRUD para usuários no MongoDb.
 *   - name: Buckets
 *     description: Operações com buckets S3.
 */

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => logInfo('MongoDB conectado'))
.catch(err => {
    console.error("Erro na conexão MongoDB:", err);
    logError('Erro ao conectar MongoDB', null, err);
});

// Mongoose model
const UserSchema = new mongoose.Schema({
    nome: String,
    email: String
});
const User = mongoose.model('Usuario', UserSchema);

// Testar conexão
app.get('/mongodb/testar-conexao', async (req, res) => {
    try {
        const user = await User.findOne();
        logInfo('Teste conexão MongoDB OK', req);
        if (user) {
            res.status(200).send('Conexão com MongoDB OK - Usuário encontrado.');
        } else {
            res.status(200).send('Conexão com MongoDB OK - Nenhum usuário encontrado.');
        }
    } catch (error) {
        console.error("Erro detalhado:", error);
        logError('Erro no teste MongoDB', req, error);
        res.status(500).send('Erro na conexão com o MongoDB.');
    }
});

// CRUD Usuários
app.post('/usuarios', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        logInfo('Usuário criado', req);
        res.status(201).json(user);
    } catch (error) {
        logError('Erro ao criar usuário', req, error);
        res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
});

app.get('/usuarios', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        logError('Erro ao listar usuários', req, error);
        res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
});

app.get('/usuarios/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.json(user);
    } catch (error) {
        logError('Erro ao buscar usuário', req, error);
        res.status(500).json({ error: 'Erro ao buscar usuário.' });
    }
});

app.put('/usuarios/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.json(user);
    } catch (error) {
        logError('Erro ao atualizar usuário', req, error);
        res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
});

app.delete('/usuarios/:id', async (req, res) => {
    try {
        const result = await User.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.json({ message: 'Usuário removido com sucesso.' });
    } catch (error) {
        logError('Erro ao remover usuário', req, error);
        res.status(500).json({ error: 'Erro ao remover usuário.' });
    }
});

// AWS S3 configuração
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
});
const s3 = new AWS.S3();

// Listar buckets
app.get('/buckets', async (req, res) => {
    try {
        const data = await s3.listBuckets().promise();
        res.json(data.Buckets);
    } catch (error) {
        logError('Erro ao listar buckets', req, error);
        res.status(500).json({ error: 'Erro ao listar buckets.' });
    }
});

// Listar objetos do bucket
app.get('/buckets/:bucketName', async (req, res) => {
    const params = { Bucket: req.params.bucketName };
    try {
        const data = await s3.listObjectsV2(params).promise();
        res.json(data.Contents);
    } catch (error) {
        logError('Erro ao listar objetos', req, error);
        res.status(500).json({ error: 'Erro ao listar objetos.' });
    }
});

// Upload
const upload = multer({ storage: multer.memoryStorage() });
app.post('/buckets/:bucketName/upload', upload.single('file'), async (req, res) => {
    const { bucketName } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const params = {
        Bucket: bucketName,
        Key: req.file.originalname,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
    };

    try {
        const data = await s3.upload(params).promise();
        res.json({ message: 'Upload concluído.', data });
    } catch (error) {
        logError('Erro no upload', req, error);
        res.status(500).json({ error: 'Erro ao enviar arquivo.' });
    }
});

// Deletar objeto
app.delete('/buckets/:bucketName/file/:fileName', async (req, res) => {
    const { bucketName, fileName } = req.params;
    const params = {
        Bucket: bucketName,
        Key: fileName
    };

    try {
        await s3.deleteObject(params).promise();
        res.json({ message: 'Arquivo removido.' });
    } catch (error) {
        logError('Erro ao remover arquivo', req, error);
        res.status(500).json({ error: 'Erro ao remover arquivo.' });
    }
});

// Swagger
swaggerDocs(app);

// Iniciar servidor
app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
