import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptCredential, decryptCredential } from '../src/lib/crypto';

test('Cifrado y descifrado de credenciales', async (t) => {
  await t.test('cifra y descifra una contraseña correctamente', () => {
    const password = 'PasswordSuperSecreta123!#';
    const encrypted = encryptCredential(password);
    assert.notEqual(encrypted, password);
    assert.match(encrypted, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);

    const decrypted = decryptCredential(encrypted);
    assert.equal(decrypted, password);
  });

  await t.test('genera diferentes IV para la misma contraseña', () => {
    const password = 'MismaClave';
    const enc1 = encryptCredential(password);
    const enc2 = encryptCredential(password);
    assert.notEqual(enc1, enc2);
    assert.equal(decryptCredential(enc1), password);
    assert.equal(decryptCredential(enc2), password);
  });

  await t.test('falla al descifrar si el payload fue manipulado', () => {
    const password = 'SeguridadTotal';
    const encrypted = encryptCredential(password);
    const parts = encrypted.split(':');
    // Alterar el último carácter del texto cifrado
    const corruptedCiphertext = parts[2].slice(0, -2) + (parts[2].endsWith('a') ? 'b' : 'a');
    const tampered = `${parts[0]}:${parts[1]}:${corruptedCiphertext}`;

    assert.throws(() => {
      decryptCredential(tampered);
    });
  });

  await t.test('maneja strings vacíos con gracia', () => {
    assert.equal(encryptCredential(''), '');
    assert.equal(decryptCredential(''), '');
  });
});
