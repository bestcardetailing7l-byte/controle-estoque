const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const suppliersRoutes = require('./routes/suppliers');
const movementsRoutes = require('./routes/movements');
const reportsRoutes = require('./routes/reports');

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/movements', movementsRoutes);
app.use('/api/reports', reportsRoutes);

// Default route - serve login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// Start server
async function startServer() {
    await db.initSchema();

    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚗 CONTROLE DE ESTOQUE - ESTÉTICA AUTOMOTIVA                ║
║                                                               ║
║   Servidor rodando em: http://localhost:${PORT}                  ║
║                                                               ║
║   Usuário padrão: admin                                       ║
║   Senha padrão: admin123                                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    });
}

startServer();
