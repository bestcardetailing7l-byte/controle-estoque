const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Get all vendors
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;

        let query = 'SELECT * FROM vendors WHERE 1=1';
        const params = [];

        if (search) {
            const searchTerm = `%${search}%`;
            if (db.isPostgres) {
                query += ` AND (name ILIKE $${params.length + 1} OR phone ILIKE $${params.length + 2})`;
            } else {
                query += ' AND (name LIKE ? OR phone LIKE ?)';
            }
            params.push(searchTerm, searchTerm);
        }

        query += ' ORDER BY name ASC';

        const vendors = await db.query(query, params);
        res.json(vendors);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar fornecedores' });
    }
});

// Get single vendor
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
        if (!vendor) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        res.json(vendor);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar fornecedor' });
    }
});

// Create vendor
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const result = await db.run(
            'INSERT INTO vendors (name, phone) VALUES (?, ?)',
            [name, phone || '']
        );

        const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', [result.lastID]);
        res.status(201).json(vendor);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar fornecedor' });
    }
});

// Update vendor
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, phone } = req.body;

        const existing = await db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }

        await db.run(
            'UPDATE vendors SET name = ?, phone = ? WHERE id = ?',
            [name || existing.name, phone !== undefined ? phone : existing.phone, req.params.id]
        );

        const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
        res.json(vendor);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
    }
});

// Delete vendor
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const existing = await db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }

        await db.run('DELETE FROM vendors WHERE id = ?', [req.params.id]);
        res.json({ message: 'Fornecedor excluído com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao excluir fornecedor' });
    }
});

// Get vendor purchase history (for price comparison report)
router.get('/:id/purchases', authenticateToken, async (req, res) => {
    try {
        const purchases = await db.query(`
            SELECT m.*, p.name as product_name, p.sku as product_sku
            FROM movements m
            JOIN products p ON m.product_id = p.id
            WHERE m.vendor_id = ? AND m.type = 'entry'
            ORDER BY m.created_at DESC
        `, [req.params.id]);

        res.json(purchases);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar histórico de compras' });
    }
});

module.exports = router;
