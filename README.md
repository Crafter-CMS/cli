# @crafter-cms/cli

Crafter platformu için tema yönetim aracı (Marketplace).

## Kurulum

```bash
npm install -g @crafter-cms/cli
```

Veya `npx` ile doğrudan kullanın:

```bash
npx @crafter-cms/cli <komut>
```

Kısayol komutu:

```bash
crafter <komut>
```

## Komutlar

### Kimlik Doğrulama

- `crafter login`: Tarayıcı üzerinden giriş yapın.
- `crafter logout`: Oturumu kapatın.
- `crafter whoami`: Giriş yapmış olan kullanıcı bilgisini görün.

### Tema Geliştirme

- `crafter init`: Yeni bir tema projesi başlatın veya var olan temanızı seçin.
- `crafter dev`: Akıllı senkronizasyon ve geliştirme izleme (watcher) aracını başlatın. (1.0.7: canlı önizleme güvenlik güncellemesi nedeniyle geçici olarak kapalı; dosya senkronizasyonu çalışır.)
- `crafter push`: Yerel dosyaları tamamen buluta yükleyin (Sıfırdan senkronizasyon).
- `crafter pull`: Buluttaki tüm dosyaları yerel klasöre indirin. (1.0.7: sunucuda indirme uç noktası olmadığı için geçici olarak kullanılamıyor.)
- `crafter pack`: Temayı satmak/dağıtmak üzere .zip haline getirin.
- `crafter publish`: Geliştirme (dev) ortamınızdaki dosyaları alıp resmi bir sürüm (versiyon) olarak paketler ve onay sürecine gönderir.
