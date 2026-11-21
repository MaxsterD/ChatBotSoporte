// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // Las pantallas cargan datos al montar y guardan el resultado en estado.
    // Ese patrón es intencional aquí; la regla nueva de React Hooks lo marca
    // como cascada aunque el setState ocurra después del await.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
