# Roadmap MVP — Reunión 21/4

> **Cambio de foco** respecto a versiones previas: el MVP se centra en el
> **Agency Workspace**. El **Client Portal** queda como acompañamiento al
> estilo del CAR actual (sin grandes inversiones en UX propia). Criterio:
> ser **terrenales y realistas**, lanzar para validar concepto e iterar.

---

## Plan de ataque (Mié 22 → Vie 25)

Cada item está taggeado con **Prioridad** (P0/P1/P2) y **Esfuerzo**
(`S` ≤ 1h, `M` ≈ 2-4h, `L` día completo o más).

### 🟢 HOY — Miércoles 22/4 (día completo)

> Bloque de **quick wins**: removals, renames, defaults y bugs visibles. La
> idea es liquidar todo lo `S` y dejar arrancado algún `M` corto.

**Removals & cleanup (P0 / S):**
- [ ] Sacar **Sign in con Microsoft** del Free Trial
- [ ] Sacar **LinkedIn Import** del ATS
- [ ] Sacar **Bullhorn / competencia** del selector de import
- [ ] **Eliminar el apartado de Deals**
- [ ] Sacar **“Assigned Recruiter”** del lado cliente
- [ ] Sacar **Calendar del lado cliente**
- [ ] Sacar **“Client Portal users”** (la invitación al portal va desde
  Contacts)
- [ ] Sacar de la vista de cliente el **contact y el mail principal**
- [ ] Sacar del **intake form** todo lo relacionado al main contact
- [ ] **Auto-filled document** que no aparezca de antemano, solo si se carga
  un documento

**Renames & textos (P0 / S):**
- [ ] Renombrar **“Contacted” → “Internal Review”**
- [ ] Volver a poner el **nombre de la empresa** debajo de “Recruiting ATS”
- [ ] Botón **“Share with Client”** (label + copy del modal)
- [ ] En Sign in / Trial, copy del Client Portal: *“you already pay a fee, no
  need to pay for the ATS as well”* (texto, sin selector aún)

**Defaults & UX chiquitas (P0-P1 / S):**
- [ ] **Prefijo telefónico por IP** (default +54 desde AR, +1 desde US, etc.)
- [ ] Edición por **ícono de lápiz** (entrar a editar solo con el lápiz, no
  al clickear el medio del campo)
- [ ] **Modal de confirmación al Share** (*“Are you sure you want to share
  this profile with the client?”*)
- [ ] **Back to home desde el Client Portal** (link visible y funcional)
- [ ] Cliente: **forzar solo mail** al invitar (no buscar por empresa)
- [ ] En **Assigned Firms**: sacar “Candidates” y mostrar **Rejected**

**Bugs P0 (S/M):**
- [ ] **Typeahead de firmas** (`Mora` no matchea `Morabits`) — `S`
- [ ] **Descarga de adjuntos** en el Client Portal (sí sube, no baja) — `M`
- [ ] **Pantalla Candidates del portal**: al apretar un job se rompe — `M`
- [ ] **Candidato no aparece** en la solapa de la búsqueda en el portal — `M`

---

### 🟡 MAÑANA — Jueves 23/4 (día corto, con reuniones)

> Tareas medianas autocontenidas que no requieran sesión larga. Pensado para
> arrancar y cerrar en bloques de 1-2h entre reuniones.

**Onboarding & primer login (P0 / M):**
- [ ] **Forzar industria + tamaño de empresa** durante el onboarding
- [ ] **Verificación de mail** apenas te logueás
- [ ] **Banner de migración semana 1** (solo agencia): empujar a migrar info
  desde otro ATS / portal

**Auth & selector (P0 / M):**
- [ ] **Un solo login** para Client Portal y Agency Workspace
- [ ] **Selector Agency / Client** en Sign in y en Start Free Trial

**Clientes & Contactos (P0 / M):**
- [ ] **Sacar Main Contact** del flujo de creación; permitir marcar uno desde
  Contacts una vez creado el cliente
- [ ] **Attachments al crear un cliente** (sumar sección)
- [ ] Cliente — **Sumar member al equipo**: si el usuario ya existe sugerir
  *“agregar usuario existente”*; si no, permitir crearlo

**Búsquedas — quality of life (P1 / M):**
- [ ] Al **crear una búsqueda** para un cliente con contactos en el portal:
  mostrar **sugerencias** para invitarlos (sugerir, no auto-invitar)
- [ ] **Persistir el documento JD** parseado (hoy se parsea pero no queda
  registro). Mismo trato para Additional Documents

---

### 🔥 VIERNES 25/4 (día fuerte — liquidar el grueso)

> Día para los bloques más grandes y entrelazados. Agrupados por feature.

**Pipeline & Share (P0 / L):**
- [ ] **Share solo permitido al pasar a Submitted** (drag o botón Share desde
  Contacted/Internal Review → Submitted)
- [ ] Recién después del confirm, el candidato aparece en el portal
- [ ] **Cambio de stage ágil sin entrar a la búsqueda** (dropdown desde Jobs;
  reflejado en el pipeline)
- [ ] **List view** de candidatos en una búsqueda (además del Pipeline /
  Kanban)
- [ ] Desde **info del candidato**: mostrar búsquedas activas y permitir
  cambiar stage ahí mismo

**Notas & Chats (P0 / L):**
- [ ] **Notas del candidato** independientes del job (notas del candidato +
  notas dentro de cada búsqueda en la que esté)
- [ ] Por búsqueda: **chat interno** + **chat con el cliente**
- [ ] Por candidato dentro de una búsqueda: **chat interno** + **chat con el
  cliente**
- [ ] Replicar la lógica de chats del lado cliente (espejo)

**Acceso diferenciado (P0 / M):**
- [ ] Diferenciar **acceso al portal del cliente** vs **acceso a una JO**
- [ ] **Invite Contact** dentro de una búsqueda: mostrar contactos del portal
  + permitir crear nuevo (queda automáticamente como contacto del cliente)
- [ ] **Your Team** (cliente) general, pero al crear una JO elegir cuáles de
  los members del portal tienen acceso a esa JO

**Placements (P0 / L):**
- [ ] Al cargar un Placed: **modal “Congratulations!”** con CTAs
  *Skip / Complete later* y *Fill Form*
- [ ] Form de Placements **autocompletando** términos comerciales del cliente
  + salary del candidato (todo editable)
- [ ] Campos: Agreed Salary, Estimated Start Date, Payment Terms, fecha de
  pago, **fecha de cobro calculada**
- [ ] **Agregar Placements de forma manual** desde el apartado de Placements

**Interviews & Calendar (P0 / L):**
- [ ] Al pasar el stage a **Interview** (cualquier vista): modal con CTA
  para **crear el evento en el Calendar**
- [ ] **Vista de Interviews** dentro del Job: lista (fecha, candidato, etc.)
  para internas y no internas

**Import (P1 / L):**
- [ ] Pantalla de **mapeo de columnas** al importar
- [ ] Soporte de formatos: **`.csv`, `.xlsx`, `.xls`, `.tsv`**
- [ ] **CV import** (subida individual)

**Portal — refinamientos (P1 / M):**
- [ ] **Dashboard inicial — “Firms engaged”** interactivo (click → detalle)
- [ ] Sumar **list view** de candidatos en proceso por búsqueda
- [ ] **Deshacer invites** (revocar las que quedaron en historial)
- [ ] Cliente: solo lectura del **status del candidato** (no modifica el
  pipeline)

---

### 🔵 Posterga (lunes+ / nice-to-have, P2)

- [ ] **Video de Loom** al primer login + pensar al menos uno más para
  etapas siguientes
- [ ] **Seguimiento por mail automatizado con Apollo** (login event hook)
- [ ] **Revisar copy del mail de Welcome**
- [ ] **Logo y landing definitivos**
- [ ] **Pre-landing tipo Calendly** usando el calendar del ATS para
  agendar con candidatos. Investigar bien (lado cliente se complica)

---

## Detalle por área (referencia completa)

### 1. Onboarding & primer login (Agency)
- Loom de onboarding apenas te logueás (P2)
- Forzar industria + tamaño (P0 / Jue)
- Verificación de mail (P0 / Jue)
- Banner de migración semana 1 (P0 / Jue)
- Revisar mail de Welcome (P2)
- Seguimiento por mail / Apollo (P2)

### 2. Auth, sign-up y selector
- Un solo login Agency + Portal (P0 / Jue)
- Selector Agency / Client en Sign in y Trial (P0 / Jue)
- Copy *“you already pay a fee…”* en opción Client Portal (P0 / Hoy)
- Sacar Sign in con Microsoft del Trial (P0 / Hoy)
- Default prefijo telefónico por IP (P1 / Hoy)

### 3. Branding & Landing
- Volver a poner nombre de empresa bajo “Recruiting ATS” (P0 / Hoy)
- Logo + landing definitivos (P2)

### 4. Agency Workspace

**4.1 Clientes**
- Sacar Main Contact del create; marcar desde Contacts (P0 / Jue)
- Sacar contact + mail de la vista de cliente (P0 / Hoy)
- Sacar todo lo de Main Contact del intake form (P0 / Hoy)
- Eliminar Deals (P0 / Hoy)
- Attachments al crear cliente (P0 / Jue)
- Auto-filled document oculto si no hay doc (P0 / Hoy)
- Edición por lápiz (P0 / Hoy)
- Borrar “Client Portal users” — invitar desde Contacts (P0 / Hoy)

**4.2 Acceso diferenciado Portal vs JO**
- Diferenciar acceso al portal vs acceso a una búsqueda (P0 / Vie)
- Sugerencias de contactos al crear búsqueda (sin auto-invitar) (P1 / Jue)
- Invite Contact: mostrar contactos del portal + crear nuevo (P0 / Vie)
- Si se crea un nuevo contacto vía búsqueda → queda como contacto del
  cliente (P0 / Vie)
- Cliente: forzar solo mail al invitar (no empresa) (P0 / Hoy)

**4.3 Búsquedas / Jobs**
- Notas del candidato vs notas en la búsqueda (P0 / Vie)
- Chats internos + chats con cliente, por búsqueda y por candidato (P0 / Vie)
- Persistir documento JD parseado + Additional Documents (P0 / Jue)

**4.4 Candidatos & Pipeline**
- Share NO automático, requiere apretar Share (P0 / Hoy — modal)
- Share solo en Submitted (drag o botón) (P0 / Vie)
- Renombrar Contacted → Internal Review (P0 / Hoy)
- Modal de confirmación + botón “Share with Client” (P0 / Hoy)
- Cambio de stage ágil desde Jobs (dropdown) (P0 / Vie)
- Pipeline (kanban) + List view (P0 / Vie)
- Cambio de stage desde info del candidato (P0 / Vie)

**4.5 Placements**
- Modal “Congratulations!” con Skip / Fill Form (P0 / Vie)
- Form autocompletado con términos del cliente + salary del candidato
  (editable) (P0 / Vie)
- Agreed Salary, Estimated Start Date, Payment Terms, fecha de pago, fecha
  de cobro calculada (P0 / Vie)
- Agregar Placements manualmente (P0 / Vie)

**4.6 Calendar & Interviews**
- Modal al pasar a Interview con CTA crear evento (P0 / Vie)
- Vista de Interviews del Job (P0 / Vie)
- Pre-landing tipo Calendly (P2)

**4.7 Import**
- Mapeo de columnas (P1 / Vie)
- Formatos: csv, xlsx, xls, tsv (P1 / Vie)
- CV upload (P1 / Vie)
- Sacar LinkedIn Import (P0 / Hoy)
- Sacar Bullhorn / competencia (P0 / Hoy)

### 5. Client Portal

> Filosofía: solo lectura para los candidatos, mantener simple.

- Dashboard “Firms engaged” interactivo (P1 / Vie)
- Sacar Assigned Recruiter (P0 / Hoy)
- Assigned Firms: Candidates → Rejected (P0 / Hoy)
- Sacar Calendar (P0 / Hoy)
- Bug: descarga de adjuntos (P0 / Hoy)
- Sumar member: existing vs new (P0 / Jue)
- Chats por búsqueda + por candidato (interno + con agencia) (P0 / Vie)
- List view de candidatos en proceso (P1 / Vie)
- Bug: candidato conectado que no aparece en la solapa (P0 / Hoy)
- Bug: Candidates → click en job se rompe (P0 / Hoy)
- Your Team general + acceso por JO al crear búsqueda (P0 / Vie)
- Deshacer invites (P1 / Vie)
- Bug typeahead Mora / Morabits (P0 / Hoy)
- Back to home (P0 / Hoy)
- Cliente: forzar solo mail al invitar (no empresa) (P0 / Hoy)

### 6. Mailing & seguimiento
- Verificación de mail (P0 / Jue)
- Apollo (login event) (P2)
- Revisar Welcome mail (P2)

---

## Resumen ejecutivo

- **Hoy (Mié):** ~25 quick wins entre removals, renames, defaults y bugs
  visibles. La idea es entrar al jueves con la base limpia.
- **Jueves:** onboarding + auth unificado + clientes (Main Contact + Attachments) +
  persistencia del JD + sugerencias de contactos. Bloques cortos por las
  reuniones.
- **Viernes:** día fuerte — pipeline & share, notas & chats, placements,
  interviews, import. Es donde se concentra el grueso del roadmap.
- **Posterga:** Loom, Apollo, landing y pre-landing tipo Calendly.
