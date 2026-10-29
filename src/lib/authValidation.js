export function validateRegistration(values) {
  const errors = {}
  const email = String(values.email || '').trim()
  const name = String(values.fullName || '').trim()
  const password = String(values.password || '')
  const confirmPassword = String(values.confirmPassword || '')

  if (name.length < 2) errors.fullName = 'Enter your full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
  if (password.length < 8) errors.password = 'Use at least 8 characters.'
  else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) errors.password = 'Include at least one letter and one number.'
  if (!confirmPassword) errors.confirmPassword = 'Confirm your password.'
  else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  if (!['farmer', 'buyer', 'both'].includes(values.accountType)) errors.accountType = 'Choose an account type.'
  return errors
}

export function validateLogin(values) {
  const errors = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email || '').trim())) errors.email = 'Enter a valid email address.'
  if (!values.password) errors.password = 'Enter your password.'
  return errors
}
