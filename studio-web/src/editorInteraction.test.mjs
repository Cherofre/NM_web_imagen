import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function keyboardHandler(file) {
  const ast = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let source;
  function visit(node) {
    if (file === 'MaskEditor.tsx' && ts.isFunctionDeclaration(node) && node.name?.text === 'handleKeyDown') source = `${node.getText(ast)}; handleKeyDown;`;
    if (file === 'ImageEditor.tsx' && ts.isJsxAttribute(node) && node.name.text === 'onKeyDown') {
      const attributes = node.parent.properties;
      if (attributes.some((attr) => ts.isJsxAttribute(attr) && attr.name.text === 'className' && attr.initializer?.text === 'image-editor')) source = `(${node.initializer.expression.getText(ast)});`;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(source, `missing actual keyboard handler: ${file}`);
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

for (const file of ['ImageEditor.tsx', 'MaskEditor.tsx']) {
  const handler = keyboardHandler(file);
  function setup(drawing = false) {
    let closed = 0, undos = 0;
    const ctx = {
      busy: false, saving: false, editing: false, selected: null, ready: true, action: "annotate",
      showBrush: false, gesture: { current: drawing ? {} : null }, panGesture: { current: null },
      activeStrokeRef: { current: drawing ? {} : null }, pointerRef: { current: null },
      onClose() { closed++; }, onCancel() { closed++; }, undo() { undos++; }, redo() { undos++; },
    };
    const run = vm.runInNewContext(handler, ctx);
    const event = (key, composing = false, ctrlKey = false) => ({
      key, ctrlKey, metaKey: false, altKey: false, shiftKey: false,
      nativeEvent: { isComposing: composing }, target: { matches: () => false },
      preventDefault() {}, stopPropagation() {},
    });
    return { run, event, closed: () => closed, undos: () => undos };
  }
  test(`${file} Escape dismisses IME composition without closing the editor`, () => {
    const state = setup();
    state.run(state.event('Escape', true));
    assert.equal(state.closed(), 0);
    state.run(state.event('Escape'));
    assert.equal(state.closed(), 1);
  });
  test(`${file} undo cannot alter history halfway through a pointer stroke`, () => {
    const drawing = setup(true);
    drawing.run(drawing.event('z', false, true));
    assert.equal(drawing.undos(), 0);
    const idle = setup();
    idle.run(idle.event('z', false, true));
    assert.equal(idle.undos(), 1);
  });
}
