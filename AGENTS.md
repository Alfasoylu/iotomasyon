<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dokümantasyon disiplini (ZORUNLU)

Her tamamlanan görevden sonra ilgili MD dosyaları GÜNCELLENİR. Bu opsiyonel değildir:

1. **`docs/PDKS.md` → "Yapılanlar (delta günlüğü)"** bölümüne, yapılan işin kısa
   bir özeti (tarih + ne yapıldı + dosya/etki) **eklenir** (append-only, en yeni üstte).
2. Tamamlanmış ve doğrulanmış iş ise **`docs/CHANGELOG.md`**'ye de madde eklenir
   (CHANGELOG kuralları: yalnızca biten+doğrulanan iş; gelecek planı yazma).
3. Yeni hedef/faz/backlog maddesi ortaya çıktıysa **`docs/PDKS.md` → "Backlog &
   Hedefler"** ve **"Fazlar"** bölümleri güncellenir.
4. Bir backlog maddesi tamamlandığında, "Backlog"tan işaretlenir/çıkarılır ve
   "Yapılanlar"a taşınır.

Kısa kural: **kod değişti → MD değişir.** Commit, doküman güncellemesini de içermelidir.
