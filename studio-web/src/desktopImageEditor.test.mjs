import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const ast = (file) => ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const app = ast('./App.tsx');
function find(root, predicate) {
  let result;
  function visit(node) { if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(root);
  assert.ok(result, 'Actual production source node must exist');
  return result;
}
function evaluate(node, source, context) {
  const js = ts.transpileModule(`(${node.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return vm.runInNewContext(js, context);
}
function jsxGuard(className) {
  const attr = find(app, n => ts.isJsxAttribute(n) && n.name.text === 'className' && n.initializer?.text === className);
  // Include the actual runtime conditional surrounding the element.
  let parent = attr.parent;
  while (parent && !ts.isJsxExpression(parent)) parent = parent.parent;
  assert.ok(parent?.expression);
  return parent.expression;
}
const React = { createElement(type, props, ...children) { return { type, props, children: children.flat(Infinity) }; } };

for (const desktopMode of [false, true]) {
  test(`${desktopMode ? 'desktop' : 'web'} preview renders all four editing actions and routes each click`, () => {
    const calls = [];
    const previewImage = { src: '/outputs/result.png', name: 'result.png' };
    const ctx = { desktopMode, previewImage, language: 'zh', React, previewMaskLoading: false,
      PencilLine: 'PencilLine', MessageSquarePlus: 'MessageSquarePlus', ScanLine: 'ScanLine', Eraser: 'Eraser',
      isSameOriginOutput: src => src.startsWith('/outputs/'), openImageEditor: (...args) => calls.push(args) };
    const render = () => evaluate(jsxGuard('preview-image-edit-tools'), app, ctx);
    const tree = render();
    assert.equal(tree.type, 'div');
    assert.equal(tree.children.length, 4);
    assert.deepEqual(tree.children.map(button => button.children[1].children[0]), ['标注', '添加评论', '移除背景', '局部修改']);
    for (const button of tree.children) { assert.equal(button.props.disabled, false); button.props.onClick(); }
    assert.deepEqual(calls.map(([image, action]) => { assert.equal(image, previewImage); return action; }), ['annotate', 'comment', 'background', 'local']);
    ctx.previewMaskLoading = true;
    assert.ok(render().children.every(button => button.props.disabled));
    ctx.previewMaskLoading = false;
    previewImage.src = 'https://untrusted.invalid/image.png';
    assert.ok(render().children.every(button => button.props.disabled));
    previewImage.sourceFile = new File(['image'], 'local.png', { type: 'image/png' });
    assert.ok(render().children.every(button => !button.props.disabled));
    previewImage.isMaskSnapshot = true;
    assert.equal(render(), false);
  });

  test(`${desktopMode ? 'desktop' : 'web'} failed edit exposes recovery without resubmitting`, () => {
    const calls = [];
    const turn = { status: 'error', meta: { image_edit_action: 'local' } };
    const node = evaluate(jsxGuard('continue-image-edit'), app, { desktopMode, turn, React, language: 'zh', PencilLine: 'icon', recoverableImageEditAction: meta => meta.image_edit_action, continueImageEdit: item => calls.push(item) });
    assert.equal(node.type, 'button'); node.props.onClick();
    assert.deepEqual(calls, [turn]);
  });
}

test('App enables draft restore for both runtimes', () => {
  const call = find(app, n => ts.isCallExpression(n) && n.expression.getText(app) === 'useEditorDrafts');
  for (const desktopMode of [false, true]) assert.equal(evaluate(call.arguments[2], app, { desktopMode }), true);
});

test('desktop reference local-edit entry opens the shared workspace', () => {
  const handler = find(app, n => ts.isFunctionDeclaration(n) && n.name?.text === 'openMaskEditor');
  const file = new File(['image'], 'reference.png');
  const calls = [];
  const open = evaluate(handler, app, { desktopMode: true, maskCapability: { available: true }, references: [file], openImageEditor: (...args) => calls.push(args), setMaskEditorOpen: () => assert.fail('Legacy mask entry must not open') });
  open();
  assert.equal(calls[0][0].sourceFile, file);
  assert.equal(calls[0][1], 'local');
});

test('annotated export uses native save on desktop and browser download on web; cancellation unlocks editor', async () => {
  const source = ast('./ImageEditor.tsx');
  const handler = find(source, n => ts.isFunctionDeclaration(n) && n.name?.text === 'download');
  for (const desktop of [true, false]) {
    const calls = [], states = [], errors = [];
    const sending = { current: false };
    const output = new File(['png'], 'marked.png');
    const ctx = { sending, Error, setBusy: value => states.push(value), setError: value => errors.push(value), exportFile: async () => output,
      isDesktopRuntime: () => desktop, saveDesktopImageAs: async file => { assert.equal(file, output); calls.push('native'); return null; },
      URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => calls.push('revoke') },
      document: { createElement: () => ({ click: () => calls.push('browser') }) }, setTimeout: fn => fn() };
    await evaluate(handler, source, ctx)();
    assert.deepEqual(calls, desktop ? ['native'] : ['browser', 'revoke']);
    assert.deepEqual(states, [true, false]); assert.equal(sending.current, false); assert.deepEqual(errors, ['']);
    ctx.exportFile = async () => { throw new Error('export failed'); };
    await evaluate(handler, source, ctx)();
    assert.equal(errors.at(-1), 'export failed'); assert.equal(sending.current, false);
  }
});

test('desktop remembered exit waits for pending draft writes before terminating', async () => {
  const listener = find(app, n => ts.isCallExpression(n) && n.expression.getText(app) === 'listen' && n.arguments[0]?.text === 'desktop-close-requested');
  let complete;
  const calls = [];
  const pending = new Promise(resolve => { complete = resolve; });
  const close = evaluate(listener.arguments[1], app, { desktopCloseBehavior: 'exit', editorDrafts: { flush() { calls.push('flush'); return pending; } }, exitDesktopApp() { calls.push('exit'); } });
  close(); assert.deepEqual(calls, ['flush']);
  complete(); await pending; await Promise.resolve();
  assert.deepEqual(calls, ['flush', 'exit']);
});

test('native image export bridge transfers actual bytes, skips web and rejects oversize before reading', async () => {
  const source = ast('./desktopRuntime.ts');
  const handler = find(source, n => ts.isFunctionDeclaration(n) && n.name?.text === 'saveDesktopImageAs');
  // Remove export for evaluation as a function expression.
  const js = ts.transpileModule(handler.getText(source).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [];
  const ctx = vm.createContext({ isDesktopRuntime: () => true, Uint8Array, invoke: async (...args) => { calls.push(args); return null; } });
  vm.runInContext(js, ctx);
  await ctx.saveDesktopImageAs(new File([new Uint8Array([137, 80, 78, 71])], '标注.png'));
  assert.equal(calls[0][0], 'desktop_save_image_as');
  assert.deepEqual(Array.from(calls[0][1].bytes), [137, 80, 78, 71]);
  assert.equal(calls[0][1].suggestedName, '标注.png');
  await assert.rejects(ctx.saveDesktopImageAs({ size: 25 * 1024 * 1024 + 1, arrayBuffer() { assert.fail('Must reject before reading'); } }), /25 MB/);
  ctx.isDesktopRuntime = () => false;
  assert.equal(await ctx.saveDesktopImageAs({}), null);
  assert.equal(calls.length, 1);
});
