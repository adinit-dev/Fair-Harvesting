import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLogin, validateRegistration } from '../src/lib/authValidation.js'

test('registration validates complete profile details', () => {
  assert.deepEqual(validateRegistration({
    fullName: 'Pema Lyngdoh', email: 'pema@example.com', password: 'harvest123', confirmPassword: 'harvest123', accountType: 'farmer',
  }), {})
})

test('registration rejects weak password, mismatched confirmation, and invalid email', () => {
  const errors = validateRegistration({
    fullName: 'P', email: 'not-an-email', password: 'short', confirmPassword: 'different', accountType: 'seller',
  })
  assert.ok(errors.fullName)
  assert.ok(errors.email)
  assert.ok(errors.password)
  assert.ok(errors.confirmPassword)
  assert.ok(errors.accountType)
})

test('login validates email and password without calling Supabase', () => {
  assert.deepEqual(validateLogin({ email: 'farmer@example.com', password: 'secret123' }), {})
  assert.ok(validateLogin({ email: '', password: '' }).email)
  assert.ok(validateLogin({ email: 'farmer@example.com', password: '' }).password)
})
