const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Get all suppliers
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;

        let query = 'SELECT * FROM suppliers WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (name LIKE ? OR contact LIKE ? OR email LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ' ORDER BY name ASC';

        const suppliers = await db.query(query, params);
        res.json(suppliers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar fornecedores' });
    }
});

// Get single supplier
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const supplier = await db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);

        if (!supplier) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }

        res.json(supplier);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar fornecedor' });
    }
});

// Create supplier
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, contact, phone, email, address } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const result = await db.run(`
      INSERT INTO suppliers (name, contact, phone, email, address)
      VALUES (?, ?, ?, ?, ?) ${db.isPostgres ? 'RETURNING id' : ''}
    `, [name, contact || '', phone || '', email || '', address || '']);

        const id = result.lastID;
        const supplier = await db.get('SELECT * FROM suppliers WHERE id = ?', [id]);
        res.status(201).json(supplier);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar fornecedor' });
    }
});

// Update supplier
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, contact, phone, email, address } = req.body;

        const existing = await db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }

        await db.run(`
      UPDATE suppliers 
      SET name = ?, contact = ?, phone = ?, email = ?, address = ?
      WHERE id = ?
    `, [
            name || existing.name,
            contact !== undefined ? contact : existing.contact,
            phone !== undefined ? phone : existing.phone,
            email !== undefined ? email : existing.email,
            address !== undefined ? address : existing.address,
            req.params.id
        ]);

        const supplier = await db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
        res.json(supplier);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
    }
});

// Delete supplier
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const existing = await db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }

        await db.run('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
        res.json({ message: 'Fornecedor excluído com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao excluir fornecedor' });
    }
});

module.exports = router;
