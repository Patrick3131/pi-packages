// Jest 29 executes CommonJS tests; convert ESM-only host dependencies, not schemas.
const { transformSync } = require('esbuild');
module.exports = {
  process(source, sourcefile) {
    return transformSync(source, { loader: 'js', format: 'cjs', target: 'node22', sourcefile, sourcemap: 'inline' });
  },
};
