Да. Вот уже **собранная структура README v1** — с секциями, подсекциями и коротким описанием, **что именно там должно быть**.

---

# README structure

## 1. Overview

### Что там будет

Короткое вступление в 1 абзац:

- это адаптер для **deployment SvelteKit apps to Azure Static Web Apps**
- он подготавливает **Azure Static Web Apps deployment layout**
- генерирует:
  - **Azure Functions output**
  - **static content output**
  - **`staticwebapp.config.json`**

- поддерживает:
  - instrumentation
  - good sourcemap handling
  - SWA-specific deployment conveniences

### Зачем секция

Сразу дать правильную mental model:
не “делает SSR”, а **адаптирует SvelteKit build для Azure SWA deployment**.

---

## 2. Why this adapter

### Что там будет

Короткий список ключевых distinctions. Без длинной истории и без слишком узких деталей.

Примерно такие смыслы:

- prepares Azure Static Web Apps deployment output
- generates Azure Functions + static content layout
- writes `staticwebapp.config.json` with SWA-safe defaults
- supports SvelteKit instrumentation
- uses Rolldown-based rebundling with correct sourcemap behavior
- includes Azure-specific compatibility handling, diagnostics, and regression tests
- supports SWA-oriented local platform emulation

### Зачем секция

Это основной **product-level differentiation block**.

---

## 3. Quick start

### 3.1 Install

#### Что там будет

- команда установки
- при необходимости короткая заметка по peer/runtime expectations

### 3.2 Configure SvelteKit

#### Что там будет

- минимальный `svelte.config.js` пример
- только golden path, без advanced options

### 3.3 TypeScript setup

#### Что там будет

- `app.d.ts` / reference setup, если это нужно для нормального user flow

### 3.4 Build

#### Что там будет

- `npm run build`
- короткая фраза, что build produces the Azure SWA deployment artifacts

### Зачем секция

Дать **самый короткий working path**.

---

## 4. Recommended Azure SWA deployment flow

### 4.1 Build first, then deploy

#### Что там будет

Явная рекомендация:

- билдить в своём CI самостоятельно
- потом деплоить уже готовый output
- Azure SWA deploy action использовать как **deploy/upload step**, а не как build system

### 4.2 Why this is recommended

#### Что там будет

Короткий список причин:

- быстрее
- предсказуемее
- avoids flaky/slow Oryx detection/build behavior
- avoids Azure/Oryx filesystem permission weirdness
- gives clearer control over the build/runtime pipeline

### 4.3 Example GitHub Actions flow

#### Что там будет

- короткий пример или ссылка на flow, основанный на `ci-swa.yml`
- build
- production deps for API output if needed
- deploy with `skip_app_build: true` and `skip_api_build: true`

### 4.4 Path mapping

#### Что там будет

Короткая таблица:

- `app_location`
- `api_location`
- `skip_app_build`
- `skip_api_build`

И note, что при prebuilt deploy `output_location` обычно не нужен.

### Зачем секция

Это один из главных practical sections README.

---

## 5. What the adapter generates

### 5.1 Azure Static Web Apps deployment layout

#### Что там будет

Чётко назвать результат build:

- Azure Functions output
- static content output

### 5.2 Generated `staticwebapp.config.json`

#### Что там будет

- генерируется автоматически
- включает SWA-safe defaults
- включает required fallback/routing behavior

### 5.3 Generated API package manifest

#### Что там будет

- для default API output path адаптер генерирует deployment package manifest
- configured externals automatically included there

### Зачем секция

Ответ на вопрос:

> что реально появляется после build и что адаптер делает за пользователя

---

## 6. Configuration options

Секция reference, но с нормальным ordering: от важного к более advanced.

### 6.1 `apiDir`

#### Что там будет

- что меняет
- default
- когда использовать
- note, что default path даёт больше automation

### 6.2 `staticDir`

#### Что там будет

- что меняет
- default
- когда имеет смысл переопределять

### 6.3 `customStaticWebAppConfig`

#### Что там будет

- как расширять generated config
- какие части guarded / нельзя бездумно override-ить
- зачем эти guardrails есть

### 6.4 `allowReservedSwaRoutes`

#### Что там будет

- `/api` reserved in Azure SWA
- адаптер защищает по умолчанию
- как и когда это осознанно отключать

### 6.5 `external`

#### Что там будет

- что остаётся external in server bundle
- при default API output configured externals автоматически попадают в generated manifest
- при custom layouts больше ответственности может перейти к пользователю

### 6.6 `emulate`

#### Что там будет

- local SWA platform emulation
- anonymous/authenticated flows
- `App.Platform`-related use cases

### 6.7 `serverRolldown`

#### Что там будет

- advanced customization of server bundling
- явно пометить как advanced

### 6.8 Advanced notes

#### Что там будет

- коротко про `debug`
- коротко про `testWorkarounds`
- без раздувания main options flow

### Зачем секция

Дать нормальный options reference без каши.

---

## 7. Instrumentation, sourcemaps, and observability

### 7.1 Instrumentation support

#### Что там будет

- адаптер поддерживает SvelteKit instrumentation contract
- instrumentation output correctly included in generated Azure Functions deployment output
- важно для observability tooling

### 7.2 Sourcemaps

#### Что там будет

- sourcemaps are handled correctly by default
- Rolldown-based rebundling is part of that story

### 7.3 Sentry in monorepos

#### Что там будет

- в monorepos source path rewriting relative to repo root required
- для этого есть `sentryRewriteSourcesFactory`
- в non-monorepo case rewrite обычно не нужен

### Зачем секция

Это сильная technical differentiation section, но уже после базового deployment flow.

---

## 8. Local development and diagnostics

### 8.1 Regular development

#### Что там будет

- обычный SvelteKit dev flow остаётся обычным

### 8.2 Azure SWA CLI

#### Что там будет

- как валидировать deployment/output через SWA CLI
- note, что SWA CLI и Azure cloud не всегда 1:1 identical

### 8.3 Backend coverage note

#### Что там будет

- короткая ссылка/указание, что backend coverage through SWA CLI supported in project CI flow
- можно сослаться на `ci-swa.yml`
- mention, что coverage-v8 затем конвертируется в lcov script-ом

### 8.4 Azure-specific behavior notes

#### Что там будет

- краткая оговорка, что некоторые platform quirks tracked with diagnostics/tests

### Зачем секция

Собрать всё dev/test/diagnostics-related в одно место, но не раздуть.

---

## 9. Compatibility

### Что там будет

Короткий compatibility block:

- SvelteKit compatibility
- Azure Functions v4 programming model
- Node 20 / 22 support
- SWA runtime expectations / default target notes

### Зачем секция

Снять типовые вопросы заранее.

---

## 10. Performance

### Что там будет

Очень коротко, factual:

- adapter overhead is low
- Rolldown keeps deployment preparation fast
- можно привести один аккуратный demo-build signal, но без агрессивного маркетинга

### Зачем секция

Хороший trust signal, но не делать из него headline.

---

## 11. Migration / differences from upstream

### Что там будет

Короткая секция:

- README is for this maintained fork/rework
- major differences in output/build approach
- Rolldown-based pipeline
- instrumentation / sourcemap / SWA deployment improvements
- relevant behavior/option changes from upstream if they matter for users

### Зачем секция

Сохранить upstream context, но не строить весь README вокруг fork-story.

---

## 12. Troubleshooting

### 12.1 `/api` route conflicts

#### Что там будет

- why `/api` is special in SWA
- what happens by default
- how to resolve / opt out

### 12.2 Azure build path mistakes

#### Что там будет

- wrong `app_location`
- wrong `api_location`
- custom dir mismatches

### 12.3 Oryx / Azure-managed build issues

#### Что там будет

- why build-it-yourself flow is recommended
- flaky detection / permission weirdness / predictability issues

### 12.4 SWA CLI vs Azure cloud differences

#### Что там будет

- expected mismatch warning
- local success does not always guarantee cloud-identical behavior

### 12.5 Monorepo Sentry path rewriting

#### Что там будет

- why Sentry source mapping breaks in monorepos without rewrite
- use the helper

### 12.6 Empty form POSTs returning 415

#### Что там будет

- Azure SWA / Functions can drop `content-type` on empty form submissions
- this can make SvelteKit return `415 Unsupported Media Type`
- workaround updated for current Azure behavior
- diagnostics and regression tests keep track of future changes

### Зачем секция

Здесь живут concrete operational problems и реальные Azure quirks.

---

## 13. Acknowledgements

### Что там будет

- upstream adapter credit
- contributor credit if wanted

### Зачем секция

Good citizenship, без шума в main narrative.

---

# Что важно по tone/order

## Верх README должен отвечать на вопросы в таком порядке:

1. **Что это**
2. **Почему этот адаптер**
3. **Как быстро начать**
4. **Как правильно деплоить**
5. **Что build генерирует**
6. **Какие есть важные options**
7. **Observability / diagnostics / quirks**

## Чего не делать в v1

- не начинать с fork history
- не тащить `testWorkarounds` в центр README
- не раздувать coverage guide в основной файл
- не ставить узкий 415 case слишком высоко, кроме общего maturity signal в `Why this adapter`

---

# Компактный ToC-вариант

```md
# @ktarmyshov/svelte-adapter-azure-swa

## Overview

## Why this adapter

## Quick start

### Install

### Configure SvelteKit

### TypeScript setup

### Build

## Recommended Azure SWA deployment flow

### Build first, then deploy

### Why this is recommended

### Example GitHub Actions flow

### Path mapping

## What the adapter generates

### Azure Static Web Apps deployment layout

### Generated staticwebapp.config.json

### Generated API package manifest

## Configuration options

### apiDir

### staticDir

### customStaticWebAppConfig

### allowReservedSwaRoutes

### external

### emulate

### serverRolldown

### Advanced notes

## Instrumentation, sourcemaps, and observability

### Instrumentation support

### Sourcemaps

### Sentry in monorepos

## Local development and diagnostics

### Regular development

### Azure SWA CLI

### Backend coverage note

### Azure-specific behavior notes

## Compatibility

## Performance

## Migration / differences from upstream

## Troubleshooting

### /api route conflicts

### Azure build path mistakes

### Oryx / Azure-managed build issues

### SWA CLI vs Azure cloud differences

### Monorepo Sentry path rewriting

### Empty form POSTs returning 415

## Acknowledgements
```

Если хочешь, следующим сообщением я уже превращу это в **черновой skeleton README в markdown**, с кратким текстом под каждым heading.
