// @flow strict-local
import {bundler, getNextBuildSuccess, overlayFS, run} from '@parcel/test-utils';
import assert from 'assert';
import path from 'path';
import sinon from 'sinon';
import Bundler from '@parcel/bundler-default';
// $FlowFixMe[untyped-import]
import CustomBundler from './integration/incremental-bundling/node_modules/parcel-bundler-test';

const CONFIG = Symbol.for('parcel-plugin-config');

describe('incremental bundling', function() {
  // $FlowFixMe[prop-missing]
  let defaultBundlerSpy = sinon.spy(Bundler[CONFIG], 'bundle');
  let customBundlerSpy = sinon.spy(CustomBundler[CONFIG], 'bundle');

  let assertChangedAssets = (actual: number, expected: number) => {
    assert.equal(
      actual,
      expected,
      `the number of changed assets should be ${expected}, not ${actual}`,
    );
  };

  let assertTimesBundled = (actual: number, expected: number) => {
    assert.equal(
      actual,
      expected,
      `the bundler should have bundled ${expected} time(s), not ${actual}`,
    );
  };

  beforeEach(() => {
    defaultBundlerSpy.resetHistory();
    customBundlerSpy.resetHistory();
  });

  after(() => {
    defaultBundlerSpy.restore();
    customBundlerSpy.restore();
  });

  describe('non-dependency based changes', () => {
    describe('javascript', () => {
      it('add a console log should not bundle', async () => {
        let subscription;
        let fixture = path.join(__dirname, '/integration/incremental-bundling');
        try {
          let b = bundler(path.join(fixture, 'index.js'), {
            inputFS: overlayFS,
            shouldDisableCache: false,
            shouldBundleIncrementally: true,
          });

          await overlayFS.mkdirp(fixture);
          subscription = await b.watch();

          let event = await getNextBuildSuccess(b);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          await overlayFS.writeFile(
            path.join(fixture, 'index.js'),
            `import a from './a';
console.log('index.js');
console.log(a);
console.log('adding a new console');`,
          );

          event = await getNextBuildSuccess(b);
          assertChangedAssets(event.changedAssets.size, 1);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          let result = await b.run();
          let contents = await overlayFS.readFile(
            result.bundleGraph.getBundles()[0].filePath,
            'utf8',
          );
          assert(contents.includes(`console.log('adding a new console')`));
        } finally {
          if (subscription) {
            await subscription.unsubscribe();
            subscription = null;
          }
        }
      });

      it('updating a string value should not bundle', async () => {
        let subscription;
        let fixture = path.join(__dirname, '/integration/incremental-bundling');
        try {
          let b = bundler(path.join(fixture, 'index.js'), {
            inputFS: overlayFS,
            shouldDisableCache: false,
            shouldBundleIncrementally: true,
          });

          await overlayFS.mkdirp(fixture);
          subscription = await b.watch();

          let event = await getNextBuildSuccess(b);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          await overlayFS.writeFile(
            path.join(fixture, 'index.js'),
            `import a from './a';
console.log('index.js - updated string');
console.log(a);
`,
          );

          event = await getNextBuildSuccess(b);
          assertChangedAssets(event.changedAssets.size, 1);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          let result = await b.run();
          let contents = await overlayFS.readFile(
            result.bundleGraph.getBundles()[0].filePath,
            'utf8',
          );
          assert(
            contents.includes(`console.log('index.js - updated string');`),
          );
        } finally {
          if (subscription) {
            await subscription.unsubscribe();
            subscription = null;
          }
        }
      });

      it('adding a comment', async () => {
        let subscription;
        let fixture = path.join(__dirname, '/integration/incremental-bundling');
        try {
          let b = bundler(path.join(fixture, 'index.js'), {
            inputFS: overlayFS,
            shouldDisableCache: false,
            shouldBundleIncrementally: true,
          });

          await overlayFS.mkdirp(fixture);
          subscription = await b.watch();

          let event = await getNextBuildSuccess(b);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          await overlayFS.writeFile(
            path.join(fixture, 'index.js'),
            `import a from './a';
// test comment
console.log('index.js');
console.log(a);`,
          );

          event = await getNextBuildSuccess(b);
          assertChangedAssets(event.changedAssets.size, 1);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          let result = await b.run();
          let contents = await overlayFS.readFile(
            result.bundleGraph.getBundles()[0].filePath,
            'utf8',
          );
          assert(contents.includes(`// test comment`));
        } finally {
          if (subscription) {
            await subscription.unsubscribe();
            subscription = null;
          }
        }
      });

      // this case is similar to applying a patch or restarting parcel with changes
      it('adds multiple non-dependency related changes', async () => {
        let subscription;
        let fixture = path.join(__dirname, '/integration/incremental-bundling');
        try {
          let b = bundler(path.join(fixture, 'index-export.js'), {
            inputFS: overlayFS,
            shouldDisableCache: false,
            shouldBundleIncrementally: true,
          });

          await overlayFS.mkdirp(fixture);
          subscription = await b.watch();

          let event = await getNextBuildSuccess(b);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          await overlayFS.writeFile(
            path.join(fixture, 'index-export.js'),
            `import a from './a';
console.log('adding a new console');
module.exports = a;`,
          );

          await overlayFS.writeFile(
            path.join(fixture, 'a.js'),
            `export default 'a updated';`,
          );

          event = await getNextBuildSuccess(b);
          assertChangedAssets(event.changedAssets.size, 2);
          assertTimesBundled(defaultBundlerSpy.callCount, 1);

          let result = await b.run();
          let contents = await overlayFS.readFile(
            result.bundleGraph.getBundles()[0].filePath,
            'utf8',
          );

          assert(contents.includes(`console.log('adding a new console')`));

          let bundleOutput = await run(result.bundleGraph);
          assert.equal(bundleOutput, 'a updated');
        } finally {
          if (subscription) {
            await subscription.unsubscribe();
            subscription = null;
          }
        }
      });
    });

    it('update an imported css file', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index-with-css.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        await overlayFS.writeFile(
          path.join(fixture, 'a.css'),
          `html {
  color: red;
}
`,
        );

        event = await getNextBuildSuccess(b);
        assertChangedAssets(event.changedAssets.size, 1);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        let result = await b.run();
        let bundleCSS = result.bundleGraph.getBundles()[1];
        assert.equal(bundleCSS.type, 'css');

        let cssContent = await overlayFS.readFile(bundleCSS.filePath, 'utf8');
        assert(cssContent.includes(`color: red;`));
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });

    it('update both the js and imported css file', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index-with-css.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        await overlayFS.writeFile(
          path.join(fixture, 'index-with-css.js'),
          `import a from './a';
import './a.css';

console.log('index.js');
console.log(a, 'updated');`,
        );

        await overlayFS.writeFile(
          path.join(fixture, 'a.css'),
          `html {
  color: red;
}`,
        );

        event = await getNextBuildSuccess(b);
        assertChangedAssets(event.changedAssets.size, 2);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        let result = await b.run();
        let contents = await overlayFS.readFile(
          result.bundleGraph.getBundles()[0].filePath,
          'utf8',
        );

        assert(contents.includes(`console.log(_aDefault.default, 'updated');`));

        let bundleCSS = result.bundleGraph.getBundles()[1];
        assert.equal(bundleCSS.type, 'css');

        let cssContent = await overlayFS.readFile(bundleCSS.filePath, 'utf8');
        assert(cssContent.includes(`color: red;`));
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });

    it('update the bundles if entry is html and js asset is modified', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index.html'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        await overlayFS.writeFile(
          path.join(fixture, 'index.js'),
          `import a from './a';
// test comment
console.log('index.js');
console.log(a);`,
        );

        event = await getNextBuildSuccess(b);
        assertChangedAssets(event.changedAssets.size, 1);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        let result = await b.run();

        let bundleHTML = result.bundleGraph.getBundles()[0];
        assert.equal(bundleHTML.type, 'html');
        let htmlContent = await overlayFS.readFile(bundleHTML.filePath, 'utf8');

        assert(htmlContent.includes(`<html>`));

        let bundleJS = result.bundleGraph.getBundles()[1];
        assert.equal(bundleJS.type, 'js');

        let jsContent = await overlayFS.readFile(bundleJS.filePath, 'utf8');
        assert(jsContent.includes(`// test comment`));
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });
  });

  describe('dependency based changes should run the bundler', () => {
    it('adding a new dependency', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        await overlayFS.writeFile(
          path.join(fixture, 'index.js'),
          `import a from './a';
import b from './b';
console.log('index.js', b);
console.log(a);
`,
        );

        event = await getNextBuildSuccess(b);
        assertChangedAssets(event.changedAssets.size, 2);
        assertTimesBundled(defaultBundlerSpy.callCount, 2);

        let result = await b.run();
        let contents = await overlayFS.readFile(
          result.bundleGraph.getBundles()[0].filePath,
          'utf8',
        );

        assert(
          contents.includes(`console.log('index.js', _bDefault.default);`),
        );
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });

    it('adding a new dependency of a different type', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        await overlayFS.writeFile(
          path.join(fixture, 'index.js'),
          `import a from './a';
import './a.css';

console.log(a);
`,
        );

        event = await getNextBuildSuccess(b);
        assertChangedAssets(event.changedAssets.size, 2);
        assertTimesBundled(defaultBundlerSpy.callCount, 2);

        let result = await b.run();

        // one CSS and one JS bundle
        assert.equal(result.bundleGraph.getBundles().length, 2);

        let contents = await overlayFS.readFile(
          result.bundleGraph.getBundles()[0].filePath,
          'utf8',
        );

        assert(contents.includes(`console.log(_aDefault.default);`));

        let bundleCSS = result.bundleGraph.getBundles()[1];
        assert.equal(bundleCSS.type, 'css');

        let cssContent = await overlayFS.readFile(bundleCSS.filePath, 'utf8');
        assert(cssContent.includes(`color: blue;`));
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });

    it('adding a new dynamic import', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        await overlayFS.writeFile(
          path.join(fixture, 'index.js'),
          `import a from './a';
const b = import('./b');

console.log(a);
`,
        );

        event = await getNextBuildSuccess(b);
        assertChangedAssets(event.changedAssets.size, 2);
        assertTimesBundled(defaultBundlerSpy.callCount, 2);

        let result = await b.run();

        // original bundle and new dynamic import bundle JS bundle
        assert.equal(result.bundleGraph.getBundles().length, 2);

        let contents = await overlayFS.readFile(
          result.bundleGraph.getBundles()[0].filePath,
          'utf8',
        );

        assert(contents.includes(`console.log(_aDefault.default);`));

        let dynamicBundle = result.bundleGraph.getBundles()[1];
        assert.equal(dynamicBundle.type, 'js');

        let dynamicContent = await overlayFS.readFile(
          dynamicBundle.filePath,
          'utf8',
        );
        assert(dynamicContent.includes(`exports.default = 'b'`));
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });

    it('removing a dependency', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        await overlayFS.writeFile(
          path.join(fixture, 'index.js'),
          `// import a from './a';
console.log('index.js');`,
        );

        event = await getNextBuildSuccess(b);
        assertChangedAssets(event.changedAssets.size, 1);
        assertTimesBundled(defaultBundlerSpy.callCount, 2);

        let output = await overlayFS.readFile(
          path.join(fixture, 'index.js'),
          'utf8',
        );
        assert(output.includes(`// import a from './a'`));
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });
  });

  describe('other changes that would for a re-bundle', () => {
    it('changing the bundler in parcel configs', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);
        assertTimesBundled(customBundlerSpy.callCount, 0);

        await overlayFS.writeFile(
          path.join(fixture, '.parcelrc'),
          JSON.stringify({
            extends: '@parcel/config-default',
            bundler: 'parcel-bundler-test',
          }),
        );

        event = await getNextBuildSuccess(b);

        // should contain all the assets
        assertChangedAssets(event.changedAssets.size, 3);
        // the default bundler was only called once
        assertTimesBundled(defaultBundlerSpy.callCount, 1);
        // calls the new bundler to rebundle
        assertTimesBundled(customBundlerSpy.callCount, 1);

        let output = await overlayFS.readFile(
          path.join(fixture, 'index.js'),
          'utf8',
        );
        assert(output.includes(`import a from './a'`));
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });

    it('changing bundler options', async () => {
      let subscription;
      let fixture = path.join(__dirname, '/integration/incremental-bundling');
      try {
        let b = bundler(path.join(fixture, 'index.js'), {
          inputFS: overlayFS,
          shouldDisableCache: false,
          shouldBundleIncrementally: true,
        });

        await overlayFS.mkdirp(fixture);
        subscription = await b.watch();

        let event = await getNextBuildSuccess(b);
        assertTimesBundled(defaultBundlerSpy.callCount, 1);

        let pkgFile = path.join(fixture, 'package.json');
        let pkg = JSON.parse(await overlayFS.readFile(pkgFile));
        await overlayFS.writeFile(
          pkgFile,
          JSON.stringify({
            ...pkg,
            '@parcel/bundler-default': {
              http: 1,
            },
          }),
        );

        event = await getNextBuildSuccess(b);

        // should contain all the assets
        assertChangedAssets(event.changedAssets.size, 3);
        assertTimesBundled(defaultBundlerSpy.callCount, 2);
      } finally {
        if (subscription) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
    });
  });

  it('changing the namer', async () => {
    let subscription;
    let fixture = path.join(__dirname, '/integration/incremental-bundling');
    try {
      let b = bundler(path.join(fixture, 'index.js'), {
        inputFS: overlayFS,
        shouldDisableCache: false,
        shouldBundleIncrementally: true,
      });

      await overlayFS.mkdirp(fixture);
      subscription = await b.watch();

      let event = await getNextBuildSuccess(b);
      assertTimesBundled(defaultBundlerSpy.callCount, 1);

      await overlayFS.writeFile(
        path.join(fixture, '.parcelrc'),
        JSON.stringify({
          extends: '@parcel/config-default',
          namers: ['parcel-namer-test'],
        }),
      );

      event = await getNextBuildSuccess(b);

      // should contain all the assets
      assertChangedAssets(event.changedAssets.size, 3);
      // the default bundler was only called once
      assertTimesBundled(defaultBundlerSpy.callCount, 1);

      let result = await b.run();
      let bundles = result.bundleGraph.getBundles();
      assert.deepEqual(
        bundles.map(b => b.name),
        bundles.map(b => `${b.id}.${b.type}`),
      );
    } finally {
      if (subscription) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
  });

  it('changing the runtimes', async () => {
    let subscription;
    let fixture = path.join(__dirname, '/integration/incremental-bundling');
    try {
      let b = bundler(path.join(fixture, 'index.js'), {
        inputFS: overlayFS,
        shouldDisableCache: false,
        shouldBundleIncrementally: true,
      });

      await overlayFS.mkdirp(fixture);
      subscription = await b.watch();

      let event = await getNextBuildSuccess(b);
      assertTimesBundled(defaultBundlerSpy.callCount, 1);

      await overlayFS.writeFile(
        path.join(fixture, '.parcelrc'),
        JSON.stringify({
          extends: '@parcel/config-default',
          runtimes: ['parcel-runtime-test'],
        }),
      );

      event = await getNextBuildSuccess(b);

      // should contain all the assets
      assertChangedAssets(event.changedAssets.size, 3);
      assertTimesBundled(defaultBundlerSpy.callCount, 1);

      let result = await b.run();
      let res = await run(result.bundleGraph, null, {require: false});
      assert.equal(res.runtime_test, true);
    } finally {
      if (subscription) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
  });

  it('changing target options', async () => {
    let subscription;
    let fixture = path.join(__dirname, '/integration/incremental-bundling');
    try {
      let b = bundler(path.join(fixture, 'index.js'), {
        inputFS: overlayFS,
        shouldDisableCache: false,
        shouldBundleIncrementally: true,
      });

      await overlayFS.mkdirp(fixture);
      subscription = await b.watch();

      let event = await getNextBuildSuccess(b);
      assertTimesBundled(defaultBundlerSpy.callCount, 1);
      assertTimesBundled(customBundlerSpy.callCount, 0);

      let pkgFile = path.join(fixture, 'package.json');
      let pkg = JSON.parse(await overlayFS.readFile(pkgFile));
      await overlayFS.writeFile(
        pkgFile,
        JSON.stringify({
          ...pkg,
          targets: {
            esmodule: {
              outputFormat: 'esmodule',
            },
          },
        }),
      );
      event = await getNextBuildSuccess(b);

      assertChangedAssets(event.changedAssets.size, 3);
      assertTimesBundled(defaultBundlerSpy.callCount, 2);

      let output = await overlayFS.readFile(
        path.join(fixture, 'index.js'),
        'utf8',
      );
      assert(output.includes(`import a from './a'`));
    } finally {
      if (subscription) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
  });

  it('adding a new the entry', async () => {
    let subscription;
    let fixture = path.join(__dirname, '/integration/incremental-bundling');
    try {
      let b = bundler(path.join(fixture, '*.html'), {
        inputFS: overlayFS,
        shouldDisableCache: false,
        shouldBundleIncrementally: true,
      });

      await overlayFS.mkdirp(fixture);
      subscription = await b.watch();

      let event = await getNextBuildSuccess(b);
      assertTimesBundled(defaultBundlerSpy.callCount, 1);
      assertTimesBundled(customBundlerSpy.callCount, 0);

      await overlayFS.writeFile(
        path.join(fixture, 'index-new-entry.html'),
        '<html />',
      );

      event = await getNextBuildSuccess(b);

      // should contain all the assets
      assertChangedAssets(event.changedAssets.size, 1);
      assertTimesBundled(defaultBundlerSpy.callCount, 2);
    } finally {
      if (subscription) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
  });
});
