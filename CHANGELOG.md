# Changelog

## 1.0.7

### Türkçe

Güvenlik yaması (#319) sonrası uyumluluk ve küçük düzeltmeler.

- **dev:** Storefront, onaydan geçmemiş `dev/` dosyalarını artık imzalı önizleme token'ı olmadan göstermiyor. `crafter dev` bu durumda (403) çökmeden açık bir mesaj gösterir: canlı önizleme bir güvenlik güncellemesi nedeniyle geçici olarak kullanılamıyor, dosyalarınız senkronize edilmeye devam ediyor, önizleme bir sonraki CLI güncellemesiyle geri gelecek. Tema yayındaysa yayındaki sürümün önizleme bağlantısı verilir. Dosya izleme, senkronizasyon ve yükleme çalışmaya devam eder. Önizleme sunucusu hata verirse süreç kapanmaz.
- **Manifest:** `init`, `dev` ve `publish` artık yerel `crafter-manifest.json` dosyasının üzerine sunucu manifestini yazmaz (önceden `themeVersion` siliniyor, v2 temalar v1'e dönüyordu). Sunucu manifesti yalnızca eksik alanları doldurmak için okunur ve dosyaya yalnızca onayınızla yazılır. `init`, başlangıç şablonunun kendi manifestini de artık kopyalamaz.
- **pull:** Sunucuda tema dosyalarının içeriğini indiren bir uç nokta olmadığı için `pull` artık "0 dosya indirildi" demek yerine açık bir hata mesajıyla sonlanır. Yerel dosyalarınız değiştirilmez.
- **Gizli dosyalar ve yok sayma kuralları:** `.env` gibi nokta ile başlayan dosya ve klasörler ZIP'e ve izleyiciye artık girmez. `dev`, `push`, `pack` ve izleyici tek bir ortak yok sayma listesi kullanır. Sunucunun kabul etmediği dosya türleri ve 10 MB'tan büyük dosyalar, sunucudan 400/413 almak yerine yerelde uyarıyla atlanır.
- **Config izinleri:** Token içeren `~/.crafter/config.json` dosyası artık 0600 (klasörü 0700) izinle yazılır.
- **Token yenileme:** Yenilenen access ve refresh token config dosyasına kaydedilir. Aynı anda gelen istekler tek bir yenileme isteği kullanır.
- **Geliştirme:** vitest ile test altyapısı eklendi (`npm test`).

### English

Compatibility and small fixes after the security patch (#319).

- **dev:** The storefront no longer serves unreviewed `dev/` theme files without a signed preview token. On that 403, `crafter dev` no longer crashes and prints a clear message: live preview is temporarily unavailable after a security update, your files are still being synced, and a CLI update will bring preview back. If the theme is published, the published preview link is shown. File watching, sync and upload keep working. A preview server error no longer stops the process.
- **Manifest:** `init`, `dev` and `publish` no longer overwrite the local `crafter-manifest.json` with the server manifest (this used to drop `themeVersion` and turn v2 themes into v1). The server manifest is only used to fill in missing fields, and the file is only written after you confirm. `init` also no longer copies the starter template's own manifest.
- **pull:** The server has no endpoint to download theme file contents, so `pull` now fails with a clear message instead of reporting "0 files downloaded". Local files are not changed.
- **Hidden files and ignore rules:** Dotfiles and dot folders such as `.env` are no longer sent in the zip or by the watcher. `dev`, `push`, `pack` and the watcher share one ignore list. File types the server does not accept and files over 10 MB are skipped locally with a warning instead of getting a 400/413 from the server.
- **Config permissions:** `~/.crafter/config.json`, which holds tokens, is now written with mode 0600 (its folder with 0700).
- **Token refresh:** The refreshed access and refresh tokens are saved to the config file. Concurrent requests share a single refresh call.
- **Development:** Added a vitest test setup (`npm test`).
