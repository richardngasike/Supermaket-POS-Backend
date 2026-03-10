const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const salesController = require('../controllers/salesController');
const mpesaController = require('../controllers/mpesaController');
const userController = require('../controllers/userController');
const categoryController = require('../controllers/categoryController');
const reportController = require('../controllers/reportController');

// Auth routes
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticate, authController.getMe);
router.put('/auth/change-password', authenticate, authController.changePassword);

// Category routes
router.get('/categories', authenticate, categoryController.getCategories);
router.post('/categories', authenticate, authorize('admin','manager'), categoryController.createCategory);
router.put('/categories/:id', authenticate, authorize('admin','manager'), categoryController.updateCategory);

// Product routes
router.get('/products', authenticate, productController.getProducts);
router.get('/products/low-stock', authenticate, authorize('admin','manager'), productController.getLowStock);
router.get('/products/barcode/:barcode', authenticate, productController.getProductByBarcode);
router.post('/products', authenticate, authorize('admin','manager'), productController.createProduct);
router.put('/products/:id', authenticate, authorize('admin','manager'), productController.updateProduct);
router.post('/products/:id/restock', authenticate, authorize('admin','manager'), productController.restockProduct);

// Sales routes
router.post('/sales', authenticate, salesController.createSale);
router.get('/sales', authenticate, salesController.getSales);
router.get('/sales/summary', authenticate, authorize('admin','manager','supervisor'), salesController.getDailySummary);
router.get('/sales/:id', authenticate, salesController.getSaleById);
router.put('/sales/:id/void', authenticate, authorize('admin','manager'), salesController.voidSale);

// MPesa routes
router.post('/mpesa/stk-push', authenticate, mpesaController.initiateSTKPush);
router.post('/mpesa/callback', mpesaController.mpesaCallback); // No auth, called by Safaricom
router.get('/mpesa/status/:checkout_request_id', authenticate, mpesaController.querySTKStatus);

// User routes (admin only)
router.get('/users', authenticate, authorize('admin'), userController.getUsers);
router.post('/users', authenticate, authorize('admin'), userController.createUser);
router.put('/users/:id', authenticate, authorize('admin'), userController.updateUser);
router.post('/users/:id/reset-password', authenticate, authorize('admin'), userController.resetUserPassword);

// Report routes
router.get('/reports/sales', authenticate, authorize('admin','manager','supervisor'), reportController.getSalesReport);
router.get('/reports/receipt/:id', authenticate, reportController.generateReceiptPDF);

module.exports = router;
