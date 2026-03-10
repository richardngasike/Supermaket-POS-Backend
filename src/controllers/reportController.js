const PDFDocument = require('pdfkit');
const pool = require('../utils/db');

const STORE_NAME = 'Naretu Supermarket';
const STORE_ADDRESS = 'Moi Avenue, Nairobi CBD, Nairobi, Kenya';
const STORE_TEL = '+254 718 959 781';
const STORE_EMAIL = 'info@naretu.com';
const STORE_WEBSITE = 'www.naretu.com';
const STORE_KRA_PIN = 'P051234567X';
const STORE_VAT_REG = 'VAT/2026/00123';

const formatKES = (amount) =>
  `KES ${parseFloat(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d) =>
  new Date(d).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

const drawQRPlaceholder = (doc, x, y, size, text) => {
  // Outer border
  doc.rect(x, y, size, size).stroke('#000000');
  // Corner squares (QR finder patterns)
  const cs = Math.floor(size * 0.22);
  const gap = 3;
  // Top-left finder
  doc.rect(x + gap, y + gap, cs, cs).stroke();
  doc.rect(x + gap + 2, y + gap + 2, cs - 4, cs - 4).fill('#000000');
  // Top-right finder
  doc.rect(x + size - cs - gap, y + gap, cs, cs).stroke();
  doc.rect(x + size - cs - gap + 2, y + gap + 2, cs - 4, cs - 4).fill('#000000');
  // Bottom-left finder
  doc.rect(x + gap, y + size - cs - gap, cs, cs).stroke();
  doc.rect(x + gap + 2, y + size - cs - gap + 2, cs - 4, cs - 4).fill('#000000');
  // Center dots pattern
  const dotSize = 2;
  const cols = 5;
  const startX = x + size * 0.35;
  const startY = y + size * 0.35;
  const spacing = (size * 0.3) / cols;
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() > 0.4) {
        doc.rect(startX + c * spacing, startY + r * spacing, dotSize, dotSize).fill('#000000');
      }
    }
  }
  doc.fillColor('#000000');
};

const drawHLine = (doc, x1, x2, y, thickness = 0.5) => {
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(thickness).stroke('#615e5a');
};

const generateReceiptPDF = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name AS cashier_name,
       COALESCE(
         json_agg(json_build_object(
           'product_name', si.product_name,
           'product_barcode', si.product_barcode,
           'quantity', si.quantity,
           'unit_price', si.unit_price,
           'vat_rate', si.vat_rate,
           'vat_amount', si.vat_amount,
           'subtotal', si.subtotal
         )) FILTER (WHERE si.id IS NOT NULL), '[]'
       ) AS items
       FROM sales s
       LEFT JOIN users u ON s.cashier_id = u.id
       LEFT JOIN sale_items si ON s.id = si.sale_id
       WHERE s.id::text = $1 OR s.receipt_number = $1
       GROUP BY s.id, u.full_name`,
      [req.params.id]
    );

    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Sale not found' });

    const sale = result.rows[0];
    const pageW = 226;
    const margin = 10;
    const contentW = pageW - margin * 2;

    // Estimate page height dynamically
    const itemCount = sale.items.length;
    const estimatedHeight = 480 + itemCount * 18 + 80;

    const doc = new PDFDocument({
      size: [pageW, estimatedHeight],
      margins: { top: 10, bottom: 10, left: margin, right: margin },
      autoFirstPage: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=receipt-${sale.receipt_number}.pdf`
    );
    doc.pipe(res);

    let y = 12;

    // ─── STORE LOGO / NAME ───────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold')
      .fillColor('#000000')
      .text(STORE_NAME, margin, y, { width: contentW, align: 'center' });
    y += 16;

    doc.fontSize(5).font('Helvetica')
      .text(STORE_ADDRESS, margin, y, { width: contentW, align: 'center' });
    y += 10;

    doc.text(`Tel: ${STORE_TEL}  |  ${STORE_EMAIL}`, margin, y, { width: contentW, align: 'center' });
    y += 10;

    doc.text(STORE_WEBSITE, margin, y, { width: contentW, align: 'center' });
    y += 10;

    doc.text(`KRA PIN: ${STORE_KRA_PIN}  |  VAT Reg: ${STORE_VAT_REG}`, margin, y, { width: contentW, align: 'center' });
    y += 8;

    drawHLine(doc, margin, pageW - margin, y, 1);
    y += 6;

    // ─── RECEIPT TITLE ────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica-Bold')
      .text('OFFICIAL RECEIPT', margin, y, { width: contentW, align: 'center' });
    y += 13;

    drawHLine(doc, margin, pageW - margin, y, 0.5);
    y += 5;

    // ─── RECEIPT META ─────────────────────────────────────────────
    const leftCol = margin;
    const rightCol = pageW - margin;

    doc.fontSize(5.5).font('Helvetica-Bold').text('Receipt No:', leftCol, y, { width: 70 });
    doc.font('Helvetica').text(sale.receipt_number, { align: 'right', width: contentW - 70 });
    y += 11;

    doc.font('Helvetica-Bold')
  .text('Date & Time:', leftCol, y, { width: 70 });

doc.font('Helvetica')
  .text(formatDate(sale.created_at), leftCol + 70, y, { width: contentW - 70, align: 'right' });
    y += 11;

    doc.font('Helvetica-Bold').text('Cashier:', leftCol, y, { continued: true, width: 70 });
    doc.font('Helvetica').text(sale.cashier_name || 'N/A', { align: 'right', width: contentW - 70 });
    y += 11;

    if (sale.customer_name) {
      doc.font('Helvetica-Bold').text('Customer:', leftCol, y, { continued: true, width: 70 });
      doc.font('Helvetica').text(sale.customer_name, { align: 'right', width: contentW - 70 });
      y += 11;
    }

    if (sale.customer_phone) {
      doc.font('Helvetica-Bold').text('Phone:', leftCol, y, { continued: true, width: 70 });
      doc.font('Helvetica').text(sale.customer_phone, { align: 'right', width: contentW - 70 });
      y += 11;
    }

    y += 3;
    drawHLine(doc, margin, pageW - margin, y, 0.5);
    y += 5;

    // ─── COLUMN HEADERS ───────────────────────────────────────────
    doc.fontSize(7.5).font('Helvetica-Bold');
    doc.text('ITEM DESCRIPTION', leftCol, y, { width: 90 });
    doc.text('QTY', leftCol + 92, y, { width: 20, align: 'right' });
    doc.text('UNIT', leftCol + 114, y, { width: 30, align: 'right' });
    doc.text('AMOUNT', leftCol + 146, y, { width: contentW - 146, align: 'right' });
    y += 10;

    drawHLine(doc, margin, pageW - margin, y, 0.3);
    y += 4;

    // ─── ITEMS ────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7.5);
    let itemsHaveVat = false;

    for (const item of sale.items) {
      const name = item.product_name.length > 22
        ? item.product_name.slice(0, 22) + '..'
        : item.product_name;

      doc.text(name, leftCol, y, { width: 90 });
      doc.text(`${item.quantity}`, leftCol + 92, y, { width: 20, align: 'right' });
      doc.text(formatKES(item.unit_price).replace('KES ', ''), leftCol + 114, y, { width: 30, align: 'right' });
      doc.text(formatKES(item.subtotal).replace('KES ', ''), leftCol + 146, y, { width: contentW - 146, align: 'right' });
      y += 11;

      if (item.vat_rate > 0) itemsHaveVat = true;

      if (item.vat_rate > 0) {
        doc.fillColor('#555555').fontSize(6.5)
          .text(`  (incl. ${item.vat_rate}% VAT)`, leftCol, y, { width: 150 });
        doc.fillColor('#000000').fontSize(7.5);
        y += 9;
      }
    }

    y += 2;
    drawHLine(doc, margin, pageW - margin, y, 0.3);
    y += 5;

    // ─── TOTALS ───────────────────────────────────────────────────
    const totalsLeft = leftCol + 60;
    const totalsRight = contentW - 60;

    doc.fontSize(7.5).font('Helvetica');
    doc.text('Subtotal:', totalsLeft, y, { continued: true, width: totalsRight });
    doc.text(formatKES(sale.subtotal), { align: 'right', width: totalsRight });
    y += 11;

    if (parseFloat(sale.vat_amount) > 0) {
      doc.text('VAT (16%):', totalsLeft, y, { continued: true, width: totalsRight });
      doc.text(formatKES(sale.vat_amount), { align: 'right', width: totalsRight });
      y += 11;
    }

    if (parseFloat(sale.discount_amount) > 0) {
      doc.fillColor('#006600');
      doc.text('Discount:', totalsLeft, y, { continued: true, width: totalsRight });
      doc.text(`-${formatKES(sale.discount_amount)}`, { align: 'right', width: totalsRight });
      doc.fillColor('#000000');
      y += 11;
    }

    y += 2;
    drawHLine(doc, totalsLeft, pageW - margin, y, 0.5);
    y += 4;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('TOTAL DUE:', totalsLeft, y, { continued: true, width: totalsRight });
    doc.text(formatKES(sale.total_amount), { align: 'right', width: totalsRight });
    y += 14;

    drawHLine(doc, margin, pageW - margin, y, 1);
    y += 6;

    // ─── PAYMENT INFO ─────────────────────────────────────────────
    doc.fontSize(8).font('Helvetica-Bold')
      .text('PAYMENT DETAILS', margin, y, { width: contentW, align: 'center' });
    y += 11;

    doc.fontSize(7.5).font('Helvetica');
    doc.text('Method:', leftCol, y, { continued: true, width: 80 });
    doc.font('Helvetica-Bold').text(sale.payment_method.toUpperCase(), { align: 'right', width: contentW - 80 });
    doc.font('Helvetica');
    y += 11;

    if (sale.payment_method === 'mpesa') {
      if (sale.customer_phone) {
        doc.text('M-Pesa Phone:', leftCol, y, { continued: true, width: 80 });
        doc.text(sale.customer_phone, { align: 'right', width: contentW - 80 });
        y += 11;
      }
      if (sale.mpesa_ref) {
        doc.text('M-Pesa Ref:', leftCol, y, { continued: true, width: 80 });
        doc.font('Helvetica-Bold').text(sale.mpesa_ref, { align: 'right', width: contentW - 80 });
        doc.font('Helvetica');
        y += 11;
      }
      doc.fillColor('#006600').fontSize(7)
        .text('✓ M-Pesa Payment Confirmed', margin, y, { width: contentW, align: 'center' });
      doc.fillColor('#000000').fontSize(7.5);
      y += 10;
    }

    if (sale.payment_method === 'card') {
      if (sale.card_ref) {
        doc.text('Card Ref:', leftCol, y, { continued: true, width: 80 });
        doc.font('Helvetica-Bold').text(sale.card_ref, { align: 'right', width: contentW - 80 });
        doc.font('Helvetica');
        y += 11;
      }
      doc.fillColor('#006600').fontSize(7)
        .text('✓ Card Payment Approved', margin, y, { width: contentW, align: 'center' });
      doc.fillColor('#000000').fontSize(7.5);
      y += 10;
    }

    if (sale.payment_method === 'cash') {

  const tendered = parseFloat(sale.amount_tendered || 0);
  const total = parseFloat(sale.total_amount || 0);

  // Calculate change if DB value missing
  const change = sale.change_amount != null
    ? parseFloat(sale.change_amount)
    : tendered - total;

  // CASH TENDERED
  doc.text('Cash Tendered:', leftCol, y, { width: 90 });

  doc.text(
    formatKES(tendered),
    leftCol + 90,
    y,
    { width: contentW - 90, align: 'right' }
  );

  y += 10;

  // CHANGE GIVEN
  if (change > 0) {

    doc.font('Helvetica-Bold').fillColor('#ff0000');

    doc.text('Change Given:', leftCol, y, { width: 90 });

    doc.text(
      formatKES(change),
      leftCol + 90,
      y,
      { width: contentW - 90, align: 'right' }
    );

    doc.font('Helvetica').fillColor('#000000');

    y += 11;
  }
}

    y += 3;
    drawHLine(doc, margin, pageW - margin, y, 0.5);
    y += 6;

    // ─── ITEMS SUMMARY ────────────────────────────────────────────
    const totalItems = sale.items.reduce((sum, i) => sum + parseInt(i.quantity), 0);
    doc.fontSize(7.5).font('Helvetica')
      .text(`Items Purchased: ${sale.items.length} lines  |  Total Units: ${totalItems}`, margin, y, { width: contentW, align: 'center' });
    y += 10;

    // ─── VAT BREAKDOWN ────────────────────────────────────────────
    if (itemsHaveVat) {
      drawHLine(doc, margin, pageW - margin, y, 0.3);
      y += 4;
      doc.fontSize(7).font('Helvetica-Bold')
        .text('VAT SUMMARY', margin, y, { width: contentW, align: 'center' });
      y += 9;
      doc.font('Helvetica');
      doc.text('Standard Rate (16%):', leftCol, y, { continued: true, width: 110 });
      doc.text(formatKES(sale.vat_amount), { align: 'right', width: contentW - 110 });
      y += 9;
      doc.text('Zero Rated (0%):', leftCol, y, { continued: true, width: 110 });
      doc.text('KES 0.00', { align: 'right', width: contentW - 110 });
      y += 10;
    }

    drawHLine(doc, margin, pageW - margin, y, 0.5);
    y += 6;

    // ─── QR CODE AREA ─────────────────────────────────────────────
    doc.fontSize(7).font('Helvetica-Bold')
      .text('SCAN TO VERIFY RECEIPT', margin, y, { width: contentW, align: 'center' });
    y += 9;

    const qrSize = 50;
    const qrX = (pageW - qrSize) / 2;
    drawQRPlaceholder(doc, qrX, y, qrSize, sale.receipt_number);

    doc.fontSize(6).font('Helvetica')
      .text(STORE_WEBSITE + '/verify/' + sale.receipt_number, margin, y + qrSize + 2, { width: contentW, align: 'center' });
    y += qrSize + 14;

    drawHLine(doc, margin, pageW - margin, y, 0.5);
    y += 6;

    // ─── FOOTER MESSAGES ──────────────────────────────────────────
    doc.fontSize(7.5).font('Helvetica-Bold')
      .text('Thank you for shopping at ' + STORE_NAME + '!', margin, y, { width: contentW, align: 'center' });
    y += 10;

    doc.fontSize(7).font('Helvetica').fillColor('#333333');
    doc.text('Please retain this receipt for warranty & returns.', margin, y, { width: contentW, align: 'center' });
    y += 9;
    doc.text('Goods once sold are not returnable without receipt.', margin, y, { width: contentW, align: 'center' });
    y += 9;
    doc.text('Exchange allowed within 7 days with original receipt.', margin, y, { width: contentW, align: 'center' });
    y += 9;
    doc.text(`Complaints & Feedback: ${STORE_TEL}`, margin, y, { width: contentW, align: 'center' });
    y += 9;
    doc.text(STORE_EMAIL, margin, y, { width: contentW, align: 'center' });
    y += 9;
    doc.fillColor('#000000');

    drawHLine(doc, margin, pageW - margin, y, 0.5);
    y += 5;

    doc.fontSize(6.5).font('Helvetica').fillColor('#666666')
      .text(`This is a computer-generated receipt and does not require a signature.`, margin, y, { width: contentW, align: 'center' });
    y += 8;
    doc.text(`Powered by SupermarketPOS Kenya  |  © ${new Date().getFullYear()}`, margin, y, { width: contentW, align: 'center' });

    doc.fillColor('#000000');
    doc.end();
  } catch (err) {
    console.error('Receipt PDF error:', err);
    res.status(500).json({ success: false, message: 'PDF generation failed' });
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { start_date, end_date, format } = req.query;
    const start = start_date || new Date().toISOString().split('T')[0];
    const end = end_date || start;

    const summary = await pool.query(
      `SELECT COUNT(*) as total_sales, SUM(total_amount) as total_revenue, SUM(vat_amount) as total_vat,
       SUM(discount_amount) as total_discounts,
       SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END) as cash_revenue,
       SUM(CASE WHEN payment_method='mpesa' THEN total_amount ELSE 0 END) as mpesa_revenue,
       SUM(CASE WHEN payment_method='card' THEN total_amount ELSE 0 END) as card_revenue,
       COUNT(CASE WHEN status='voided' THEN 1 END) as voided_count
       FROM sales WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [start, end]
    );

    const salesByDay = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count, SUM(total_amount) as revenue
       FROM sales WHERE DATE(created_at) BETWEEN $1 AND $2 AND status='completed'
       GROUP BY DATE(created_at) ORDER BY date`,
      [start, end]
    );

    const topProducts = await pool.query(
      `SELECT si.product_name, SUM(si.quantity) as total_qty, SUM(si.subtotal) as total_revenue, COUNT(DISTINCT s.id) as sale_count
       FROM sale_items si JOIN sales s ON si.sale_id=s.id
       WHERE DATE(s.created_at) BETWEEN $1 AND $2 AND s.status='completed'
       GROUP BY si.product_name ORDER BY total_revenue DESC LIMIT 20`,
      [start, end]
    );

    const cashierPerformance = await pool.query(
      `SELECT u.full_name, u.username, COUNT(s.id) as sale_count, SUM(s.total_amount) as revenue
       FROM sales s JOIN users u ON s.cashier_id=u.id
       WHERE DATE(s.created_at) BETWEEN $1 AND $2 AND s.status='completed'
       GROUP BY u.id, u.full_name, u.username ORDER BY revenue DESC`,
      [start, end]
    );

    const data = {
      summary: summary.rows[0],
      sales_by_day: salesByDay.rows,
      top_products: topProducts.rows,
      cashier_performance: cashierPerformance.rows,
      period: { start, end },
    };

    if (format === 'pdf') return generateSalesPDF(res, data);

    res.json({ success: true, ...data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const generateSalesPDF = (res, data) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=sales-report-${data.period.start}-to-${data.period.end}.pdf`
  );
  doc.pipe(res);

  const pageW = 595;
  const margin = 50;
  const contentW = pageW - margin * 2;

  // ─── REPORT HEADER ────────────────────────────────────────────
  doc.rect(0, 0, pageW, 100).fill('#0a0a14');
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#00d4aa')
    .text(STORE_NAME, margin, 20, { width: contentW, align: 'center' });
  doc.fontSize(13).fillColor('#ffffff')
    .text('SALES REPORT', margin, 48, { width: contentW, align: 'center' });
  doc.fontSize(9).fillColor('#aaaacc')
    .text(`${STORE_ADDRESS}  |  ${STORE_TEL}  |  KRA PIN: ${STORE_KRA_PIN}`, margin, 68, { width: contentW, align: 'center' });

  let y = 115;
  doc.fillColor('#000000');

  doc.fontSize(10).font('Helvetica')
    .text(`Report Period: `, margin, y, { continued: true })
    .font('Helvetica-Bold').text(`${data.period.start}  to  ${data.period.end}`);
  y += 14;
  doc.font('Helvetica').text(`Generated: ${formatDate(new Date())}`);
  y += 14;
  doc.font('Helvetica').text(`VAT Reg No: ${STORE_VAT_REG}`);
  y += 8;

  doc.moveTo(margin, y).lineTo(pageW - margin, y).lineWidth(1).stroke('#000000');
  y += 14;

  // ─── SUMMARY BOX ──────────────────────────────────────────────
  const s = data.summary;
  doc.rect(margin, y, contentW, 14).fill('#f0f0f0');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
    .text('FINANCIAL SUMMARY', margin + 6, y + 2);
  y += 18;

  const col1 = margin;
  const col2 = margin + contentW / 2;

  const summaryRows = [
    ['Total Transactions', s.total_sales || 0],
    ['Total Revenue', formatKES(s.total_revenue)],
    ['Total VAT Collected (16%)', formatKES(s.total_vat)],
    ['Total Discounts Given', formatKES(s.total_discounts)],
    ['Voided Transactions', s.voided_count || 0],
  ];
  const payRows = [
    ['Cash Revenue', formatKES(s.cash_revenue)],
    ['M-Pesa Revenue', formatKES(s.mpesa_revenue)],
    ['Card Revenue', formatKES(s.card_revenue)],
  ];

  doc.fontSize(9).font('Helvetica');
  for (let i = 0; i < Math.max(summaryRows.length, payRows.length); i++) {
    if (i % 2 === 0) doc.rect(margin, y, contentW, 14).fill('#fafafa');
    doc.fillColor('#000000');
    if (summaryRows[i]) {
      doc.font('Helvetica-Bold').text(summaryRows[i][0] + ':', col1, y + 2, { width: contentW / 2 - 10 });
      doc.font('Helvetica').text(String(summaryRows[i][1]), col1 + 160, y + 2);
    }
    if (payRows[i]) {
      doc.font('Helvetica-Bold').text(payRows[i][0] + ':', col2, y + 2, { width: contentW / 2 - 10 });
      doc.font('Helvetica').text(String(payRows[i][1]), col2 + 140, y + 2);
    }
    y += 14;
  }

  y += 10;
  doc.moveTo(margin, y).lineTo(pageW - margin, y).lineWidth(0.5).stroke('#cccccc');
  y += 12;

  // ─── TOP PRODUCTS ─────────────────────────────────────────────
  doc.rect(margin, y, contentW, 14).fill('#f0f0f0');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
    .text('TOP 15 PRODUCTS BY REVENUE', margin + 6, y + 2);
  y += 18;

  doc.rect(margin, y, contentW, 13).fill('#e0e0e0');
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
  doc.text('#', margin + 4, y + 2, { width: 20 });
  doc.text('Product Name', margin + 26, y + 2, { width: 230 });
  doc.text('Units Sold', margin + 260, y + 2, { width: 70, align: 'right' });
  doc.text('Transactions', margin + 335, y + 2, { width: 80, align: 'right' });
  doc.text('Revenue', margin + 420, y + 2, { width: contentW - 420, align: 'right' });
  y += 14;

  doc.fontSize(8).font('Helvetica');
  for (let i = 0; i < Math.min(data.top_products.length, 15); i++) {
    const p = data.top_products[i];
    if (i % 2 === 0) doc.rect(margin, y, contentW, 13).fill('#fafafa');
    doc.fillColor('#000000');
    doc.text(String(i + 1), margin + 4, y + 2, { width: 20 });
    doc.text(p.product_name, margin + 26, y + 2, { width: 230 });
    doc.text(String(p.total_qty), margin + 260, y + 2, { width: 70, align: 'right' });
    doc.text(String(p.sale_count), margin + 335, y + 2, { width: 80, align: 'right' });
    doc.font('Helvetica-Bold').text(formatKES(p.total_revenue), margin + 420, y + 2, { width: contentW - 420, align: 'right' });
    doc.font('Helvetica');
    y += 13;
  }

  y += 10;

  // ─── CASHIER PERFORMANCE ──────────────────────────────────────
  if (data.cashier_performance.length > 0) {
    if (y > 650) { doc.addPage(); y = 50; }

    doc.rect(margin, y, contentW, 14).fill('#f0f0f0');
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
      .text('CASHIER PERFORMANCE', margin + 6, y + 2);
    y += 18;

    doc.rect(margin, y, contentW, 13).fill('#e0e0e0');
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Cashier Name', margin + 4, y + 2, { width: 180 });
    doc.text('Username', margin + 190, y + 2, { width: 120 });
    doc.text('Transactions', margin + 316, y + 2, { width: 90, align: 'right' });
    doc.text('Total Revenue', margin + 410, y + 2, { width: contentW - 410, align: 'right' });
    y += 14;

    doc.fontSize(8).font('Helvetica');
    for (let i = 0; i < data.cashier_performance.length; i++) {
      const c = data.cashier_performance[i];
      if (i % 2 === 0) doc.rect(margin, y, contentW, 13).fill('#fafafa');
      doc.fillColor('#000000');
      doc.font('Helvetica-Bold').text(c.full_name, margin + 4, y + 2, { width: 180 });
      doc.font('Helvetica').text(c.username, margin + 190, y + 2, { width: 120 });
      doc.text(String(c.sale_count), margin + 316, y + 2, { width: 90, align: 'right' });
      doc.font('Helvetica-Bold').text(formatKES(c.revenue), margin + 410, y + 2, { width: contentW - 410, align: 'right' });
      doc.font('Helvetica');
      y += 13;
    }
  }

  y += 14;
  doc.moveTo(margin, y).lineTo(pageW - margin, y).lineWidth(0.5).stroke('#cccccc');
  y += 10;

  // ─── REPORT FOOTER ────────────────────────────────────────────
  doc.fontSize(8).font('Helvetica').fillColor('#666666')
    .text(`This report was generated automatically by SupermarketPOS Kenya on ${formatDate(new Date())}`, margin, y, { width: contentW, align: 'center' });
  y += 10;
  doc.text(`${STORE_NAME}  |  ${STORE_WEBSITE}  |  KRA PIN: ${STORE_KRA_PIN}`, margin, y, { width: contentW, align: 'center' });
  y += 10;
  doc.text('CONFIDENTIAL - For internal use only', margin, y, { width: contentW, align: 'center' });

  doc.fillColor('#000000');
  doc.end();
};

module.exports = { getSalesReport, generateReceiptPDF };