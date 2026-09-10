import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mergeImportedConfig } from './configTransfer.ts';
import { buildConfigPayload, profileFormSnapshot, syncActiveProfileForm } from './configProfiles.ts';
import * as credentials from './sharedCredentials.ts';
import * as models from './imageModelOptions.ts';

// Execute the actual event handlers, rather than asserting source-code strings.
const ast = ts.createSourceFile('App.tsx', fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
let refreshContexts;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers[node.name.text] = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  if (ts.isForOfStatement(node) && node.getText(ast).includes('modelRequestContexts.current')) refreshContexts = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  ts.forEachChild(node, visit);
}
visit(ast);
const profile = (id, engine, form, name = id) => ({ id, engine, form, name });
function context(gpt = {}, banana = {}) {
  const ctx = {
    ...credentials, ...models, profileFormSnapshot, buildConfigPayload, syncActiveProfileForm,
    gptForm: { api_key: '', base_url: 'https://a.invalid', model: 'image', ...gpt },
    bananaForm: { api_key: '', api_base_url: 'https://b.invalid', model_type: 'gemini', ...banana },
    activeEngine: 'gpt-image-2', activeProfileIds: { 'gpt-image-2': 'g', banana: 'b' },
    normalizeGptForm: (x) => ({ ...x }), normalizeBananaForm: (x) => ({ ...x }),
    profiles: [], notices: [], modelRequestContexts: { current: { 'gpt-image-2': {}, banana: {} } },
    setImageModelNotice() {}, setChatModelNotice() {}, setBananaModelNotice() {},
    setImageModelFetching() {}, setChatModelFetching() {}, setBananaModelFetching() {},
    setDiagnosticsResult() {}, t: (x) => x, engineLabel: (x) => x, makeId: (prefix) => `${prefix}-${++ctx.counter}`, counter: 0,
  };
  ctx.setNotice = (x) => ctx.notices.push(x);
  ctx.profiles = [profile('g', 'gpt-image-2', ctx.gptForm), profile('b', 'banana', ctx.bananaForm)];
  for (const [setter, field] of [['setGptForm', 'gptForm'], ['setBananaForm', 'bananaForm'], ['setProfiles', 'profiles'], ['setActiveProfileIds', 'activeProfileIds']]) {
    ctx[setter] = (value) => { ctx[field] = typeof value === 'function' ? value(ctx[field]) : value; };
  }
  vm.createContext(ctx);
  ctx.refreshContexts = () => vm.runInContext(refreshContexts, ctx);
  ctx.refreshContexts();
  for (const name of ['applyProfileForm', 'clearDiagnosticsResult', 'updateSharedPartner', 'updateGptConnectionForm', 'updateBananaConnectionForm', 'updateActiveProfileName', 'setSharedCredential', 'saveConfig', 'fetchModelListForTarget']) vm.runInContext(handlers[name], ctx);
  return ctx;
}

test('import keeps a key at its original endpoint and remaps colliding active ids', () => {
  const local = [profile('default', 'gpt-image-2', { base_url: 'https://a.invalid/API', api_key: 'SYNTHETIC' })];
  for (const endpoint of ['https://b.invalid/API', 'https://a.invalid/api', '']) {
    const result = mergeImportedConfig(local, {}, { profiles: [profile('default', 'gpt-image-2', { base_url: endpoint, credential_ref: 'shared', credential_pair_id: 'local-pair' })], active_profile_ids: { 'gpt-image-2': 'default' } });
    assert.equal(result.profiles.length, 2);
    assert.equal(result.profiles[0].form.api_key, 'SYNTHETIC');
    assert.equal(result.profiles[1].form.api_key, '');
    assert.equal(result.profiles[1].form.credential_pair_id, '');
    assert.equal(result.activeProfileIds['gpt-image-2'], result.profiles[1].id);
    assert.notEqual(result.profiles[1].id, 'default');
  }
});

test('real Save handler includes pairing and Gemini catalogue in forms and active profiles', async () => {
  const ctx = context({ credential_ref: 'shared', credential_pair_id: 'pair' }, { credential_ref: 'shared', credential_pair_id: 'pair', model_type_options: 'gemini-a\ngemini-b' });
  let saved;
  ctx.apiFetch = async (_, options) => { saved = JSON.parse(options.body); return { ok: true, json: async () => ({}) }; };
  await ctx.saveConfig();
  assert.equal(saved.forms['banana-form'].model_type_options, 'gemini-a\ngemini-b');
  for (const p of saved.profiles) {
    assert.equal(p.form.credential_ref, 'shared');
    assert.equal(p.form.credential_pair_id, 'pair');
  }
});

test('both engine switches reset absent scoped fields without touching the other connection', () => {
  const ctx = context({ api_key: 'A', credential_ref: 'shared', credential_pair_id: 'pair', model_options: 'a' }, { api_key: 'B', credential_ref: 'shared', credential_pair_id: 'pair', model_type_options: 'gemini-a' });
  ctx.applyProfileForm(profile('independent', 'gpt-image-2', { base_url: 'https://c.invalid' }));
  assert.equal(ctx.gptForm.credential_ref, '');
  assert.equal(ctx.gptForm.credential_pair_id, '');
  assert.equal(ctx.gptForm.api_key, '');
  assert.equal(ctx.bananaForm.api_key, 'B');
  ctx.applyProfileForm(profile('new', 'banana', { api_base_url: 'https://d.invalid', api_key: 'D' }));
  assert.equal(ctx.bananaForm.model_type_options, '');
  assert.equal(ctx.bananaForm.credential_ref, '');
  assert.equal(ctx.gptForm.base_url, 'https://c.invalid');
});

test('enabling a new pair preserves the unrelated active shared profile and its unsaved edits', () => {
  const ctx = context({ api_key: 'A' }, { api_key: 'UNSAVED', credential_ref: 'shared', credential_pair_id: 'other' });
  ctx.profiles[1].form = { ...ctx.bananaForm, api_key: 'OLD' };
  ctx.setSharedCredential('gpt-image-2', true);
  assert.equal(ctx.profiles.find((p) => p.id === 'b').form.api_key, 'UNSAVED');
  assert.notEqual(ctx.activeProfileIds.banana, 'b');
  assert.equal(ctx.gptForm.credential_pair_id, ctx.bananaForm.credential_pair_id);
  assert.notEqual(ctx.gptForm.credential_pair_id, 'other');
  assert.equal(ctx.bananaForm.api_key, 'A');
});

test('editing, renaming and unlinking use the actual inactive partner', () => {
  const ctx = context({ api_key: 'A', credential_ref: 'shared', credential_pair_id: 'pair-a' }, { api_key: 'B', credential_ref: 'shared', credential_pair_id: 'pair-b' });
  ctx.profiles.push(profile('actual-partner', 'banana', { api_key: 'A', credential_ref: 'shared', credential_pair_id: 'pair-a' }));
  ctx.updateGptConnectionForm({ api_key: 'NEW', base_url: 'https://new.invalid' });
  assert.equal(ctx.bananaForm.api_key, 'B');
  assert.equal(ctx.profiles.find((p) => p.id === 'actual-partner').form.api_key, 'NEW');
  ctx.updateActiveProfileName('gpt-image-2', 'Renamed');
  assert.equal(ctx.profiles.find((p) => p.id === 'actual-partner').name, 'Renamed');
  assert.equal(ctx.profiles.find((p) => p.id === 'b').name, 'b');
  ctx.setSharedCredential('gpt-image-2', false);
  assert.equal(ctx.profiles.find((p) => p.id === 'actual-partner').form.credential_ref, '');
  assert.equal(ctx.bananaForm.credential_pair_id, 'pair-b');
});

for (const target of ['image', 'chat', 'banana']) {
  test(`${target} catalogue ignores a delayed result after connection changes; unchanged request succeeds`, async () => {
    for (const change of ['profile', 'address', 'key', 'away-and-back', 'none']) {
      const stale = change !== 'none';
      const ctx = context({ api_key: 'A', model_options: '', chat_model_options: '' }, { api_key: 'B', model_type_options: '' });
      let finish;
      ctx.apiFetch = () => new Promise((resolve) => { finish = resolve; });
      const pending = ctx.fetchModelListForTarget(target);
      const engine = target === 'banana' ? 'banana' : 'gpt-image-2';
      const form = target === 'banana' ? ctx.bananaForm : ctx.gptForm;
      if (change === 'profile' || change === 'away-and-back') ctx.activeProfileIds[engine] = 'different';
      if (change === 'address') form[target === 'banana' ? 'api_base_url' : 'base_url'] = 'https://different.invalid';
      if (change === 'key') form.api_key = 'DIFFERENT';
      ctx.refreshContexts();
      if (change === 'away-and-back') {
        ctx.activeProfileIds[engine] = target === 'banana' ? 'b' : 'g';
        ctx.refreshContexts();
      }
      finish({ ok: true, json: async () => ({ ok: true, models: [target === 'banana' ? 'gemini-only' : 'relay-only'] }) });
      await pending;
      const value = target === 'banana' ? ctx.bananaForm.model_type_options : target === 'chat' ? ctx.gptForm.chat_model_options : ctx.gptForm.model_options;
      assert.equal(Boolean(value), !stale);
      if (stale) assert.equal(ctx.notices.length, 0);
    }
  });
}
