/** Minimal valid PDF for trade-finance demo invoices. */
export function buildDemoInvoicePdf(): Buffer {
  const lines = [
    "Trade Invoice INV-2026-041",
    "Exporter: Global Export Ltd",
    "Buyer: TradeFlow Capital",
    "Amount: EUR 125,000.00",
    "Incoterms: FOB",
    "Status: Paid",
    "Sealed in Veilio Vault — governed access on Canton",
  ];
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const textOps = lines
    .map((line, index) => `1 0 0 1 72 ${720 - index * 22} Tm (${escape(line)}) Tj`)
    .join("\n");
  const stream = `BT\n/F1 11 Tf\n${textOps}\nET`;
  const streamLength = Buffer.byteLength(stream, "utf8");

  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${streamLength} >>stream
${stream}
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000${(330 + streamLength).toString().padStart(3, "0")} 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
${380 + streamLength}
%%EOF`;

  return Buffer.from(pdf, "utf8");
}
