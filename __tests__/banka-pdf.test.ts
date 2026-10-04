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

  const bankHeader = [positioned("Tarih",28,750),positioned("Saat",85,750),positioned("İşlem",142,750),positioned("Kanal",205,750),positioned("Açıklama",276,750),positioned("İşlem Tutarı",452,750),positioned("Bakiye",542,750)];
  const precise = (text:string,x:number,y:number,width:number):PdfText => ({text,x,y,width});
  const crowded = pdfTable([[...bankHeader,
    positioned("Description above",276,730),
    positioned("04/10/2026",28,716),positioned("Transfer",276,716),precise("word",386,716,15),precise("-100,00",467,716,19),precise("TL",488,716,8),precise("50,00",542,716,20),
    positioned("Next description",276,700),positioned("03/10/2026",28,686),
    precise("-12345678",374,686,39),precise("- 20,00",467,686,19),precise("TL",488,686,8),precise("70,00",542,686,20),
  ]]);
  assert.equal(crowded.tumSatirlar[0][4],"Description above Transfer word");
  assert.equal(crowded.tumSatirlar[1][4],"Next description -12345678");
  assert.equal(crowded.tumSatirlar[0][5],"-100,00 TL");
  assert.equal(crowded.tumSatirlar[1][5],"- 20,00 TL");

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
