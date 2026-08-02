# نشر e-Gurus OS على DigitalOcean عبر GitHub Actions

## 1) أسرار GitHub المطلوبة
Settings → Secrets and variables → Actions:

| Secret | القيمة |
| --- | --- |
| `DEPLOY_HOST` | IP الدروبلت |
| `DEPLOY_USER` | مستخدم النشر (مثلاً `deploy`) |
| `DEPLOY_SSH_KEY` | المفتاح الخاص (ed25519) بالكامل |
| `DEPLOY_KNOWN_HOSTS` | ناتج `ssh-keyscan -H <IP>` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` | إعدادات الباك إند |
| `DEPLOY_HEALTH_URL` (اختياري) | رابط الفحص بعد النشر، الافتراضي `https://egurus.info/` |

المفتاح الخاص يُكتب في `~/.ssh` داخل الرَنر فقط، و`StrictHostKeyChecking=yes` مفعّل عبر `DEPLOY_KNOWN_HOSTS` لمنع MITM.

## 2) تجهيز السيرفر مرة واحدة
```bash
adduser --system --group --home /srv/egurus-os egurus
mkdir -p /srv/egurus-os/{releases,repo}
chown -R egurus:egurus /srv/egurus-os

# متغيرات التشغيل (سرّية)
install -m 600 /dev/null /etc/egurus-os.env
# أضف بداخله: VITE_SUPABASE_URL=..., VITE_SUPABASE_PUBLISHABLE_KEY=...,
#              VITE_SUPABASE_PROJECT_ID=..., SUPABASE_SERVICE_ROLE_KEY=...,
#              BOSTA_RECALL_SECRET=... (نفس القيمة المخزّنة في Vault باسم bosta_recall_secret), PORT=3000

# سكربت النشر + خدمة systemd
install -m 755 deploy/deploy-guru-recall.sh /usr/local/bin/deploy-guru-recall
install -m 644 deploy/egurus-os.service /etc/systemd/system/egurus-os.service
systemctl daemon-reload
systemctl enable egurus-os
```
امنح مستخدم النشر صلاحية إعادة التشغيل فقط عبر sudoers:
```
deploy ALL=(root) NOPASSWD: /usr/local/bin/deploy-guru-recall
```

## 3) ترتيب الاختبارات قبل systemd
1. **verify job** على GitHub: `npm ci` → `lint` → build بـ `NITRO_PRESET=node-server` → تشغيل `.output/server/index.mjs` والتأكد أنه يرد 200.
2. **فحص SSH**: اتصال بدون أي تغيير، ويتأكد أن `/usr/local/bin/deploy-guru-recall` موجود.
3. **على السيرفر**: بناء الإصدار الجديد في مجلد منفصل، ثم smoke test على بورت 3999.
4. فقط بعد نجاح كل ما سبق: تحويل السيملينك `current` ثم `systemctl restart`.
5. فحص صحة بعد إعادة التشغيل — أي فشل يرجع تلقائيًا للإصدار السابق (rollback).

## 4) تشغيل يدوي
Actions → Deploy to DigitalOcean → Run workflow.
