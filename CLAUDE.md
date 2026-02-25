# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm start          # Start Expo development server
npm run android    # Start with Android emulator
npm run ios        # Start with iOS simulator
npm run web        # Run web version
```

No test framework is currently configured.

---

## Frontend — React Native App

FormVox is an Expo-based React Native app (Expo SDK 54, React Native 0.81, React 19) for form digitization and voice transcription. It connects to the backend API at `https://api.scarch.cloud`.

### Entry Points
- `index.js` - Registers the root component via Expo, imports gesture handler polyfill
- `App.js` - Navigation setup with auth-conditional routing wrapped in `GestureHandlerRootView`
- `babel.config.js` - Babel preset for Expo with `react-native-reanimated` plugin

### Source Structure (`src/`)

**`api/client.js`** - Axios client with JWT interceptors. All API modules exported here:
- `auth` - Login/register
- `transcriptions` - Voice transcription CRUD and validation
- `audio` - Upload recordings, get file URLs
- `templates` - Template CRUD, field management, calibration, AI enrichment
- `documents` - Document extraction from transcriptions

**`context/AuthContext.js`** - Authentication state via React Context. Persists token/user to AsyncStorage. Provides `useAuth()` hook with `{ user, loading, login, register, logout }`.

**`screens/`** - Full-page components:
- Auth: `LoginScreen`, `RegisterScreen`
- Main: `HomeScreen`, `TranscriptionsScreen`, `TranscriptionScreen`
- Templates: `TemplatesScreen`, `TemplateDetailScreen`, `TemplateSetupScreen`, `TemplateEditorScreen`, `ImportTemplateScreen`
- Recording: `RecordScreen` (modal)

**`components/`** - Reusable UI for the template editor:
- `DraggableField` / `PlacedField` - Drag-and-drop field positioning with resize handles
- `FieldRenderer` - Field display and in-place editing with auto-sizing:
  - Supports states: `placed`, `selected`, `editing`
  - **Live horizontal expansion**: In editing mode, a hidden `<Text>` measures natural text width; `editWidthPx` local state immediately expands the container so text is always visible
  - `onAutoSize` callback reports measured dimensions to parent for persistence
  - Long-press drag via `dragPanEnabled` + `PanGestureHandler` with `activateAfterLongPress`
- `FieldConfigSheet` - Bottom sheet (2-column layout) for field configuration
- `FieldContextMenu/` - Context menu system:
  - `index.js` - Main menu with 5 buttons: Move, Resize, Text, Config, Delete
  - `submenus/MoveSubmenu.js` - Arrow grid with step size selector (1/5/10px)
  - `submenus/ResizeSubmenu.js` - Width/height controls with ±1, ±10 buttons
  - `submenus/TextSubmenu.js` - Label input, font size ±, line count selector
  - `submenus/ConfigSubmenu.js` - Full field config with:
    - Category suggestions, explicit name, technical name (readonly)
    - Group management (dropdown + create new)
    - Field type selector (text/date/number/email)
    - AI description for transcription hints
    - Action buttons: Dupliquer, Supprimer, Sauvegarder
    - **Save button with visual feedback**: Shows "Sauvegarde...", "Sauvegardé ✓", or "Erreur ✗" states
    - `scrollMaxHeight` prop for dynamic height based on available screen space

**`utils/fieldUtils.js`** - Field coordinate conversions (screen ↔ percent), field name generation, styling helpers:
- `screenToPercent()`, `percentToScreen()`, `percentToScreenSize()` - Coordinate conversions
- `generateFieldName()` / `generateFieldNameV2()` - Field naming (V2 adds category prefix + group suffix)
- `buildTechnicalFieldName()`, `deriveExplicitName()`, `formatFieldLabel()` - Label/name utilities
- `calculateFieldHeight()`, `getFieldTextStyle()` - Sizing and styling
- `CATEGORY_SUGGESTIONS` - Predefined category list
- `normalizeRepeatCount()`, `getGroupInitials()` - Group/repeat helpers
- `DEFAULT_FIELD` - Default field configuration object

**`storage/audioLibrary.js`** - Local audio file management using expo-file-system

### Key Patterns

- **Percentage-based coordinates**: Field positions stored as percentages (0-100) for responsive scaling across devices
- **Multi-page templates**: Templates support multiple pages (`pages_count`), each field tracks its `page_number`
- **Field groups**: Fields can be grouped (for tables/repeating sections) via `group_id` and `repeat_index`
- **French UI**: Error messages and labels are in French
- **Auth flow**: Navigation stack switches between auth screens (Login/Register) and app screens based on `user` state from AuthContext. 401 responses auto-logout.
- **Modal screens**: `RecordScreen` and `ImportTemplateScreen` use `presentation: 'modal'`
- **Gesture system**: PanGestureHandler (drag/resize), TapGestureHandler (selection), PinchGestureHandler (zoom in editor) with simultaneous handler coordination
- **Field drag modes**: Two navigation modes in editor:
  - Document pan when zoom > 1 (drag anywhere on sheet)
  - Long-press (450ms) on field with haptic feedback to drag-move it
  - `panBlockedRef` prevents document pan from intercepting field gestures
- **Immediate state sync**: `fieldsRef.current` updated synchronously in `updateFieldState` so `handleForceSave` always reads latest data
- **Debounced persistence**: Field changes use `schedulePersist` with 350-450ms delay; `handleForceSave` cancels pending timer and saves immediately

### Critical Coordinate Notes (TemplateEditorScreen)

Recent fixes (keep these invariants to avoid regressions):

- `src/screens/TemplateEditorScreen.js` uses **different coordinate pipelines** for marquee and tap logic.
- **Marquee (multi-select rectangle)** must use `fieldsOverlay` window measurements:
  - Measure overlay with `fieldsOverlayRef.current.measureInWindow(...)`.
  - Convert pointer to window space with `getMarqueeWindowPoint(...)`.
  - On Android, when event source is `absolute`, normalize with `absoluteY - StatusBar.currentHeight`.
  - Convert to pre-transform overlay local coords with:
    - `localX = (windowX - overlayOffsetX) / scale`
    - `localY = (windowY - overlayOffsetY) / scale`
- **Tap selection / create field** must not reuse legacy absolute conversion directly:
  - Target resolution is done via `resolveTapTargetFromEvent(nativeEvent)`.
  - Field/document hit-testing uses `getFieldsOverlayPointFromEvent(nativeEvent)?.local`.
  - Menu hit-testing still uses `getWindowPoint(nativeEvent)` (`event.x/y`, workArea-local).
- If marquee is aligned but tap is wrong, do **not** change marquee math first.
  - Re-check `handleTapStateChange`, `resolveTapTargetFromEvent`, and `handleTapAction`.
- Useful debug logs:
  - `[selection] start_abs_to_overlay`
  - `[selection] move_abs_to_overlay`
  - `source` should be consistent, and `yAdjustment` should match Android status bar height when source is `absolute`.

### Key Frontend Dependencies

- `react-native-gesture-handler` + `react-native-reanimated` - Gesture and animation
- `expo-av` - Audio recording/playback
- `expo-image-picker` / `expo-document-picker` - Media selection
- `react-native-webview` - WebView integration
- `@react-native-async-storage/async-storage` - Local persistence

---

## Backend — formvox-api

Node.js/Express API running in Docker on VPS Hostinger (`root@85.31.238.69`).
- **Source**: `/root/formvox-api/` on the VPS
- **Public URL**: `https://api.scarch.cloud` (routed via Traefik)
- **Port**: 3500 (internal Docker)
- **Entry point**: `src/index.js`

### Backend Stack
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL 16 (`voice_forms` DB, user: `n8n`)
- **Auth**: JWT (7d expiry), bcryptjs for password hashing
- **File uploads**: Multer → `/app/uploads/` (templates, audio, OCR, generation)
- **Key libs**: `pdf-lib`, `sharp`, `docx`, `axios`, `pg`

### Controllers & Routes

| Route prefix | Controller | Purpose |
|---|---|---|
| `/auth` | `authController` | Register / Login |
| `/audio` | `audioController` | Upload audio, serve files, list by transcription |
| `/transcriptions` | `transcriptionController` | CRUD + validate/complete/delete + n8n webhook |
| `/documents` | `documentController` | CGP document extraction via n8n + webhook |
| `/templates` | `templateController` | Template/document CRUD, fields, calibration, AI |
| `/work-profiles` | `workProfileController` | User work profiles (sector, context) |
| `/ocr-documents` | `ocrDocumentController` | OCR upload (images/PDF) + n8n OCR callback |
| `/form-fills` | `formFillController` | AI form filling from transcription/OCR/other fill |
| `/form-fills/:id/export` | `exportController` | Export filled form as PDF or JPG |
| `/api/document-configs` | `documentConfigController` | DOCX config builder (Carbone) + prefill |
| `/api/generation-requests` | `generationRequestController` | AI generation from audio+text+files |

### Template System (core concept)

The `templates` table is dual-purpose, distinguished by `kind`:
- `kind = 'document'` — A scanned/uploaded document (PDF or image) that needs to be filled
- `kind = 'template'` — A reusable field layout (created in TemplateEditorScreen)

A document can be linked to a template via `applied_template_id` (FK self-referential). Once linked, it becomes a "ready form" that can be AI-filled.

Key views:
- `GET /templates/view/documents` — All documents (kind=document)
- `GET /templates/view/templates` — All templates (kind=template) with attached doc counts
- `GET /templates/view/ready-forms` — Documents that have a template applied

### Template Routes Detail

```
POST   /templates/upload                   # Upload single PDF/image (20MB max)
POST   /templates/upload-multi             # Upload multiple files (up to 20)
GET    /templates/view/documents           # List documents
GET    /templates/view/templates           # List templates
GET    /templates/view/ready-forms         # List docs with template applied
POST   /templates/documents/:id/dissociate-template
DELETE /templates/documents/:id
POST   /templates/webhook/analyze-result   # n8n callback (no auth)
POST   /templates/webhook/enrich-result    # n8n callback (no auth)
GET    /templates/file/:filename           # Serve file
GET    /templates/                         # Simple list
GET    /templates/:id
DELETE /templates/:id
PATCH  /templates/:id
POST   /templates/:id/analyze              # Trigger n8n template analysis
POST   /templates/:id/clone
POST   /templates/:id/apply-template       # Link document to template
POST   /templates/:id/calibration
GET    /templates/:id/calibrations
POST   /templates/:id/fields               # Create field
PATCH  /templates/:id/fields/:fieldId      # Update field
POST   /templates/:id/fields/:fieldId/duplicate
DELETE /templates/:id/fields/:fieldId
GET    /templates/:id/page/:page/image     # Get page as image (cached)
POST   /templates/:id/enrich               # AI field enrichment via n8n
POST   /templates/:id/ai-prefill           # AI prefill via n8n
```

### Transcription Lifecycle

```
pending → (n8n processes audio) → ready → validated → completed
                                                ↓
                                        extract documents (CGP)
```
- `transcription_text`: current audio chunk text
- `accumulated_text`: all validated chunks concatenated
- Webhook from n8n: `POST /transcriptions/webhook/result` (no auth, uses `transcription_id`)
- Supports `mode: 'append'` for multi-chunk recording sessions

### Form Fill Lifecycle

```
POST /form-fills (source: transcription | ocr | form_fill)
  → creates form_fill (status: pending)
  → sends to n8n AI prefill webhook
  → n8n calls POST /form-fills/:id/callback
  → status: done, filled_values populated
  → GET /form-fills/:id/export?format=pdf|jpg
```

### n8n Webhooks (env vars)

| Env var | Used for |
|---|---|
| `N8N_WEBHOOK_TRANSCRIPTION` | Trigger audio transcription |
| `N8N_WEBHOOK_EXTRACTION` | Trigger CGP document extraction |
| `N8N_WEBHOOK_ANALYZE_TEMPLATE` | Trigger template AI analysis |
| `N8N_WEBHOOK_ENRICH_TEMPLATE` | Trigger field AI enrichment |
| `N8N_WEBHOOK_AI_PREFILL` | Trigger AI form filling |
| `N8N_WEBHOOK_FILL_FORM` | (form fill variant) |
| `N8N_WEBHOOK_OCR` | Trigger OCR processing |
| `N8N_CALLBACK_SECRET` | Shared secret for n8n → API callbacks |

All n8n callbacks include a `callback_url` + `callback_secret` in their payload so n8n can POST back results asynchronously.

### File Storage (on VPS)

```
/root/formvox-api/uploads/
├── (audio files — .m4a, .mp3, .wav)
├── templates/
│   ├── (PDF/image uploads)
│   └── cache/         ← page images rendered from PDFs
├── ocr/               ← OCR source images
└── generation/        ← audio + files for generation requests
```

---

## Infrastructure — VPS (Hostinger, root@85.31.238.69)

All services run as Docker containers orchestrated via `/root/docker-compose.yml`.

### Services

| Container | Image / Build | URL / Port | Purpose |
|---|---|---|---|
| `root-traefik-1` | `traefik` | :80/:443 | Reverse proxy + Let's Encrypt TLS |
| `root-formvox-api-1` | `./formvox-api` | `api.scarch.cloud` | Main backend API |
| `root-n8n-1` | `./n8n-ffmpeg` | `n8n.scarch.cloud` | n8n automation (with ffmpeg) |
| `root-n8n-mobile-proxy-1` | `./n8n-mobile-proxy` | `*.scarch.cloud/mobile-api` | Authenticated proxy to n8n for mobile |
| `carbone-api` | `./carbone-api` | internal :4000 | Carbone DOCX rendering (LibreOffice) |
| `image_enhancement_api` | `./image-enhancement-api` | internal :5679 | Python/OpenCV image enhancement |
| `root-postgres-1` | `postgres:16` | internal :5432 | PostgreSQL DB (`voice_forms`) |
| `root-metabase-1` | `metabase/metabase` | :3000 | Analytics dashboard |
| `vigorous_margulis` | `gotenberg/gotenberg:8` | internal | PDF generation (Gotenberg) |

### Traefik Routing

- `api.scarch.cloud` → `formvox-api` (port 3500)
- `n8n.scarch.cloud` → `n8n` (port 5678), except `/mobile-api`
- `n8n.scarch.cloud/mobile-api` → `n8n-mobile-proxy` (port 3000)
- All HTTP redirected to HTTPS, Let's Encrypt TLS via `mytlschallenge`

### Carbone API (`/root/carbone-api/`, internal port 4000)

Node.js/Express service wrapping the Carbone library (LibreOffice-based DOCX renderer).

```
GET  /health
GET  /templates            # List available .docx templates
POST /templates            # Upload a template
POST /render               # Render template with data → base64 output
POST /render/file          # Render template → file response
```

Used by `documentConfigController` to generate filled DOCX documents from Carbone templates.

### Image Enhancement API (`/root/image-enhancement-api/`, port 5679)

Python/Flask service using OpenCV for document image processing:
- Perspective correction (4-point transform)
- CLAHE contrast enhancement
- Bilateral denoising
- Document corner detection

### n8n Mobile Proxy (`/root/n8n-mobile-proxy/`)

Node.js proxy that authenticates mobile API requests (token-based) and forwards them to the internal n8n instance at `http://n8n:5678`. Adds `/mobile-api` prefix routing.

---

## Database Schema (PostgreSQL `voice_forms`)

### Core Tables

**`users`** — Auth accounts (id, email, password_hash, created_at)

**`templates`** — Documents and template layouts (dual-purpose via `kind`)
- `kind`: `'document'` | `'template'`
- `file_filename`, `file_type` (pdf/jpeg/png), `page_count`
- `status`: `'uploaded'` | `'analyzed'` | `'enriched'` | ...
- `applied_template_id` → FK self-ref (links a document to its template)
- `work_profile_id` → FK to work_profiles

**`template_fields`** — Fields placed on a template page
- `x`, `y`, `width`, `height` — percentages (0-100)
- `page_number`, `font_size`, `font_family`, `text_color`
- `field_type`: `text` | `date` | `number` | `email` | `checkbox` | `radio`
- `group_id`, `repeat_index` — for table/repeating field groups
- `category_label`, `display_name`, `ai_description`, `format_hint`
- `line_count`, `text_align`, `wrap_mode`, `line_height`, `max_chars`
- `parent_field_id` → FK self-ref (for checkbox/radio options)

**`template_calibrations`** — Calibration data per template

**`transcriptions`** — Voice recording sessions
- `status`: `'pending'` | `'ready'` | `'validated'` | `'completed'` | `'error'`
- `transcription_text` (current chunk), `accumulated_text` (all chunks)
- `audio_duration_seconds`, `transcription_segments` (JSONB)
- `session_id` (UUID, for multi-chunk sessions)

**`audio_files`** — Individual audio file uploads linked to a transcription
- `transcription_id`, `filename`, `original_name`, `size_bytes`, `duration_seconds`

**`documents`** — CGP document extraction results (legacy)
- `transcription_id`, `status`, `docx_url`, `pdf_url`, `vigilances_pdf_url`
- `client_name`, `vigilance_count`

**`ocr_documents`** — OCR scan sessions
- `status`: `'pending'` | `'processing'` | `'done'` | `'error'`
- `source_type`: `'photo'` | `'multi'`

**`ocr_pages`** — Individual pages within an OCR document
- `ocr_document_id`, `page_number`, `image_url`, `extracted_text`, `status`

**`form_fills`** — AI form filling sessions
- `document_id` (FK templates, kind=document), `template_id`
- `source_type`: `'transcription'` | `'ocr'` | `'form_fill'`
- `source_id` — ID of the source record
- `status`: `'pending'` | `'processing'` | `'done'` | `'error'`
- `fill_data` (JSONB), `document_config_id`

**`filled_values`** — Individual field values from a form fill
- `form_fill_id`, `template_field_id`, `value`

**`form_fill_field_overrides`** — UI overrides (position/style) for filled fields
- `form_fill_id`, `template_field_id`, override columns

**`document_configs`** — Carbone DOCX document structure configs
- `template_id`, `config` (JSONB — field structure for Carbone)
- `generated_docx_filename`, `generation_status`
- `prefill_data` (JSONB), `docx_path`

**`generation_requests`** — Multi-input AI generation (audio + text + files)
- `input_text`, `input_audio_filename`, `input_files` (JSONB), `input_fields` (JSONB)
- `status`: `'pending'` | `'processing'` | `'done'` | `'error'`
- `result_config` (JSONB), `result_document_config_id`

**`work_profiles`** — User work context profiles
- `user_id`, `name`, `sector`, `context`
- Unique constraint on `(user_id, name)`

**`audio_sessions`** — (legacy audio session tracking)

---

## Backend Development

To deploy changes to the backend:

```bash
# SSH into VPS
ssh root@85.31.238.69

# Rebuild and restart formvox-api
cd /root && docker compose up -d --build formvox-api

# View logs
docker logs root-formvox-api-1 -f --tail=50

# Connect to DB
docker exec -it root-postgres-1 psql -U n8n -d voice_forms
```
