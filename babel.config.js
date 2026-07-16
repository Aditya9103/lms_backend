// babel.config.js — Transpiles ESM to CJS for Jest
// The backend uses "type": "module" but Jest requires CJS (or experimental VM modules).
// This is only used during test runs — the production app runs native ESM.
export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
        modules: 'commonjs', // Transform import/export to require/module.exports
      },
    ],
  ],
};
