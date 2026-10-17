UPDATE user_account
SET
  password_hash = 'scrypt$bb96a05583fdcaca7f86c1100f95d2ad$2c938174975e2a07c850930d2718dbdb550dc7986393f759029fa1340e890caeacef44cadeedc67330a571f31c41d9242380e2c005b6c5dc72e30275cac1f235',
  failed_login_count = 0,
  locked_until = NULL,
  _updated_at = CURRENT_TIMESTAMP
WHERE lower(username) = 'admin';

UPDATE user_account
SET
  password_hash = 'scrypt$fe1e1283b3451b8f825d2cafa069f934$f794428505eca247cde8afe7cfafca6b252aed5b1d30262b5801e49600e3d2ee4cec75b850e8672cb52a16e8eec072d81ec1a7d78d7dbfd0ecd210ebd3758d8a',
  failed_login_count = 0,
  locked_until = NULL,
  _updated_at = CURRENT_TIMESTAMP
WHERE lower(username) = 'student001';
