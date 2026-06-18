# 🎯 ATS Playbook — Tu Panel de Operación

Manual de uso del ATS post-launch. Bookmarkealo. Vos no tenés que recordar nada — esta hoja te dice **cuándo mirar qué y qué hacer**.

---

## 🌐 Tus 4 paneles online

| Panel | URL | Para qué |
|-------|-----|----------|
| **ATS Producción** | https://recruitingats.com | Tu producto real |
| **ATS Staging** | https://staging.recruitingats.com | Donde probás cambios antes de pasar a prod |
| **Sentry** | https://recruiting-ats.sentry.io/issues/ | Errores reales que pasan a tus users |
| **Vercel** | https://vercel.com/dashboard | Deploys + variables de entorno + dominios |

---

## 🔔 Mi rutina diaria (5 min)

1. **Abrir Sentry**. ¿Hay issues nuevos hoy?
   - **Sí, parece real** → copialo y mandámelo (Claude) — lo arreglo.
   - **Parece bot/escaneo/ruido** → click "Resolve" y se va.
   - **No hay nada** → seguís con el día.
2. **Mirar el mail**. ¿Llegó algún error de Sentry? Mismo flow ↑.
3. **(Opcional, post-launch)** Mirar Vercel → último deploy debe decir "Ready".

Si todo está en verde, **no toques nada**. Sentry trabaja para vos.

---

## 📅 Mi rutina semanal (10 min)

Una vez por semana, pediles a Claude:

| Comando | Qué hace |
|---------|---------|
| `/cso` | Audit de seguridad. Te dice si hay agujeros nuevos por defender. |
| `/review` | Si pusheamos cambios grandes, una segunda mirada antes de pushear. |

---

## 🚀 Cuando vamos a producción (lanzamiento o release grande)

1. Le pedís a Claude: **"corré `/ship`"** — checklist ordenado de deploy a prod.
2. Verificás Vercel → deploy "Ready".
3. Probás 3 flujos críticos en producción (login + crear job + invitar recruiter).
4. Avisás al equipo + clientes si aplica.

---

## 🐛 Cuando un cliente reporta un bug

1. **Abrí Sentry** → buscá el error.
2. Si está → **copia el mensaje + stack trace + URL** → mandalos a Claude.
3. Si no está → contale a Claude el flujo exacto que hizo el cliente. Reproducimos manual.

---

## 📈 Métricas operativas del ATS

Estas viven dentro del producto, no en panel externo:

### Dashboard agency (`/dashboard`)
- **Active Searches** (jobs OPEN/ACTIVE asignados a vos)
- **Total Candidates** (todos los candidatos de tu firma)
- **Placements** (cierres)
- **Activity Trend** (qué movimiento hubo últimos 14 días)
- **Recruiter Performance** (quién está cerrando más)

### Client portal (`/client-portal/dashboard`)
- **Recruiting Firms** (cuántas firmas trabajan con el cliente)
- **Candidates shared** (qué llegó al cliente)

### Settings → Team (`/settings/team`)
- Cuántos miembros tiene tu org (afecta el billing cuando se active)
- Cuántos invites pendientes

---

## 🛠️ Comandos que te puede correr Claude

| Comando | Cuándo lo pedís |
|---------|-----------------|
| `/cso` | "Hacé audit de seguridad" — pre-launch + cada 2 semanas |
| `/review` | "Revisá el cambio antes de pushear" — automático en cambios grandes |
| `/qa` | "Probá los flujos críticos" — antes de release grande |
| `/ship` | "Hacé un release ordenado" — deploy a producción |
| `/roadmap` | "Mostrame el estado del roadmap" — para reuniones |

Vos no recordás cuándo correrlos — yo te aviso cuando convenga.

---

## ⚠️ Cosas que NO tenés que tocar

- **`.env.local`** del proyecto (variables sensibles — local de tu máquina)
- **Vercel → Environment Variables** (cargar nuevas, las viejas no)
- **DB (Neon)** — directo no. Si hay que tocar data, le pedís a Claude (yo hago scripts seguros)

---

## 🆘 Si algo se rompe en producción

1. **Sentry** te avisó por mail (configurado el 17-jun-2026 ✅)
2. Vos abrís Sentry → ves el error
3. Me lo mandás a Claude
4. Yo arreglo en staging
5. Verificamos en staging
6. Hacemos release a prod con `/ship`
7. Vos confirmás que el error dejó de pasar

**Tiempo razonable**: 15-30 min para issues normales. Para issues críticos podemos meter un hotfix en 10 min.

---

## 📞 Acción pendiente única

Tenés solo **una cosa** que solo vos podés hacer:

- [ ] **Junta con Ari** — 5 decisiones de producto pendientes (ver `ROADMAP.md` → "Decisiones pendientes"):
  - Métricas en reporting
  - Staff Aug vs Recruiting fields
  - ¿Cobrar a hiring companies?
  - Referral scheme
  - Set final de JobStatus

Cuando esas estén decididas, le metemos código.

---

**Última actualización**: 2026-06-18
