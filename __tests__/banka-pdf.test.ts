import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BankPdfError, pdfTable, type PdfText } from "../lib/banka/pdf";
import { readBankFile } from "../lib/banka/file";

const positioned = (text: string, x: number, y: number): PdfText => ({ text, x, y, width: text.length * 5 });
const header = [positioned("Tarih", 40, 750), positioned("Açıklama", 140, 750), positioned("Tutar", 400, 750), positioned("Bakiye", 500, 750)];
async function main() {
  const ham = pdfTable([
    [...header, positioned("04/10/2026", 40, 720), positioned("Örnek ödeme", 140, 720), positioned("-20,00", 400, 720), positioned("80,00", 500, 720), positioned("devam açıklaması", 140, 705)],
    [positioned("03/10/2026", 40, 720), positioned("Örnek giriş", 140, 720), positioned("100,00", 400, 720), positioned("100,00", 500, 720)],
  ]);
  assert.equal(ham.tumSatirlar.length, 2);
  assert.equal(ham.tumSatirlar[0][1], "Örnek ödeme devam açıklaması");
  assert.equal(ham.tumSatirlar[1][2], "100,00");
  assert.throws(() => pdfTable([[]]), BankPdfError);
  assert.throws(() => pdfTable([[positioned("Hesap detayları", 40, 750)]]), BankPdfError);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile("node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf"), {subset:true});
  for (let number = 0; number < 2; number++) {
    const page = pdf.addPage([600,800]);
    const draw = (text: string, x: number, y: number) => page.drawText(text, {x,y,size:10,font});
    for (const h of header) draw(h.text,h.x,h.y);
    draw(number ? "03/10/2026" : "04/10/2026",40,720);
    draw(number ? "Örnek giriş" : "Örnek ödeme",140,720);
    draw(number ? "1.234,56" : "-20,00",400,720);
    draw(number ? "1.234,56" : "1.214,56",500,720);
  }
  const bytes = Buffer.from(await pdf.save());
  const result = await readBankFile(bytes, "synthetic.pdf");
  assert.equal(result.satirlar.length, 2);
  assert.equal(result.atlanan.length, 0);
  assert.equal(result.satirlar[0].aciklama, "Örnek ödeme");
  assert.equal(result.satirlar[0].tutarTry, -20);
  assert.equal(result.satirlar[1].tutarTry, 1234.56);
  assert.equal(result.satirlar[1].tarih.toISOString().slice(0,10), "2026-10-03");
  const repeat = await readBankFile(bytes, "synthetic.pdf", result.eslesme.eslesen);
  assert.deepEqual(repeat.satirlar, result.satirlar, "preview and confirmation parse the same PDF");
  await assert.rejects(() => readBankFile(Buffer.from("not a pdf"), "wrong.pdf"), /geçerli bir PDF/);
  const scan = await PDFDocument.create(); scan.addPage();
  await assert.rejects(async () => readBankFile(Buffer.from(await scan.save()), "scan.pdf"), /okunabilir metin yok/);
  const long = await PDFDocument.create();
  for (let i=0;i<101;i++) long.addPage();
  await assert.rejects(async () => readBankFile(Buffer.from(await long.save()), "long.pdf"), /100 sayfa/);
  console.log("Bank PDF: positioned columns, wrapped descriptions, continuation/repeated headers, real multipage Turkish PDF, signed amounts, consistent preview/apply, malformed/image-only/oversized rejection passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
