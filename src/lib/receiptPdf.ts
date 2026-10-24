import { jsPDF } from "jspdf";
import { STORE } from "@contracts/constants";

export type ReceiptPdfData = {
  id: number;
  customerName: string;
  device: string;
  repairType: string;
  lines: { description: string; amountCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  paidAt: string;
  notes?: string | null;
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function clean(value: string): string {
  return value.replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7E]/g, "");
}

/**
 * Generate a clean, printable letter-size receipt entirely in the browser.
 * No payment or customer data is sent to a third-party PDF service.
 */
export function downloadReceiptPdf(receipt: ReceiptPdfData): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 54;
  const right = 558;
  const width = right - left;
  let y = 58;

  const ensureSpace = (needed: number) => {
    if (y + needed > 742) {
      doc.addPage();
      y = 58;
    }
  };

  // Burgundy top rule and wordmark.
  doc.setFillColor(127, 29, 29);
  doc.rect(0, 0, 612, 9, "F");

  doc.setTextColor(43, 26, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PAYMENT RECEIPT", left, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(112, 88, 84);
  doc.text(clean(STORE.name), right, y - 16, { align: "right" });
  doc.text(clean(STORE.address), right, y - 4, { align: "right" });
  doc.text(clean(STORE.city), right, y + 8, { align: "right" });
  doc.text(clean(STORE.phone), right, y + 20, { align: "right" });

  y += 36;
  doc.setDrawColor(235, 216, 218);
  doc.setLineWidth(0.8);
  doc.line(left, y, right, y);

  y += 24;
  doc.setTextColor(112, 88, 84);
  doc.setFontSize(9);
  doc.text("Receipt", left, y);
  doc.text("Customer", 220, y);
  doc.text("Date paid", 390, y);

  doc.setTextColor(43, 26, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`#PPR-R${receipt.id}`, left, y + 17);
  doc.text(clean(receipt.customerName), 220, y + 17, { maxWidth: 150 });
  doc.text(clean(receipt.paidAt), 390, y + 17);
  y += 40;

  doc.setTextColor(112, 88, 84);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Device", left, y);
  doc.text("Repair", 220, y);
  doc.text("Payment method", 390, y);

  doc.setTextColor(43, 26, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(clean(receipt.device), left, y + 17, { maxWidth: 150 });
  doc.text(clean(receipt.repairType), 220, y + 17, { maxWidth: 150 });
  doc.text(clean(receipt.paymentMethod.toUpperCase()), 390, y + 17);
  y += 44;

  doc.setDrawColor(235, 216, 218);
  doc.line(left, y, right, y);
  y += 22;

  doc.setTextColor(112, 88, 84);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DESCRIPTION", left, y);
  doc.text("AMOUNT", right, y, { align: "right" });
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  for (const line of receipt.lines) {
    const descriptionLines = doc.splitTextToSize(clean(line.description), 390) as string[];
    const rowHeight = Math.max(20, descriptionLines.length * 14 + 6);
    ensureSpace(rowHeight + 18);
    doc.setTextColor(43, 26, 24);
    doc.text(descriptionLines, left, y + 12);
    doc.setFont("helvetica", "bold");
    doc.text(money(line.amountCents), right, y + 12, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += rowHeight;
    doc.setDrawColor(245, 235, 235);
    doc.line(left, y, right, y);
  }

  if (receipt.taxCents > 0) {
    y += 18;
    doc.setTextColor(112, 88, 84);
    doc.text("Tax", left, y);
    doc.text(money(receipt.taxCents), right, y, { align: "right" });
    y += 10;
  }

  ensureSpace(72);
  y += 18;
  doc.setDrawColor(127, 29, 29);
  doc.setLineWidth(1.2);
  doc.line(left, y, right, y);
  y += 26;

  doc.setTextColor(43, 26, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("TOTAL PAID", left, y);
  doc.setTextColor(127, 29, 29);
  doc.setFontSize(22);
  doc.text(money(receipt.totalCents), right, y, { align: "right" });
  y += 38;

  if (receipt.notes) {
    ensureSpace(48);
    doc.setTextColor(112, 88, 84);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(clean(receipt.notes), width) as string[];
    doc.text(noteLines, left, y);
    y += noteLines.length * 12 + 10;
  }

  ensureSpace(52);
  doc.setDrawColor(235, 216, 218);
  doc.setLineWidth(0.8);
  doc.line(left, y, right, y);
  y += 18;
  doc.setTextColor(112, 88, 84);
  doc.setFontSize(8.5);
  doc.text(
    "Keep this receipt for your records - it also covers any warranty claim.",
    left,
    y,
    { maxWidth: width },
  );
  doc.text(`Thank you for choosing ${clean(STORE.name)}.`, left, y + 13, { maxWidth: width });

  doc.save(`philly-phone-repair-receipt-${receipt.id}.pdf`);
}
