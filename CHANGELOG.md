# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.5.5](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.4...v1.5.5) (2020-11-24)

### [1.5.4](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.3...v1.5.4) (2020-10-29)

### [1.5.3](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.2...v1.5.3) (2020-10-05)

### [1.5.2](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.1...v1.5.2) (2020-08-25)

### [1.5.1](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.0...v1.5.1) (2020-08-11)


### Bug Fixes

* make GITHUB_REF env var optional ([#82](https://github.com/aws-actions/configure-aws-credentials/issues/82)) ([ba5041f](https://github.com/aws-actions/configure-aws-credentials/commit/ba5041f7bb4990ac5d10d9009de69e639ebee3df)), closes [#92](https://github.com/aws-actions/configure-aws-credentials/issues/92)

## [1.5.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.4.4...v1.5.0) (2020-07-29)


### Features

* Add post-job action cleanup of credentials and region env vars ([#101](https://github.com/aws-actions/configure-aws-credentials/issues/101)) ([d19cafc](https://github.com/aws-actions/configure-aws-credentials/commit/d19cafcdd1be7e3358f84574a00df37af494036a))


### Bug Fixes

* Mask assume role response in debug output ([#102](https://github.com/aws-actions/configure-aws-credentials/issues/102)) ([df7d846](https://github.com/aws-actions/configure-aws-credentials/commit/df7d84616183de7ed37e53e1980284a07e56b216))

### [1.4.4](https://github.com/aws-actions/configure-aws-credentials/compare/v1.4.3...v1.4.4) (2020-07-17)

### [1.4.3](https://github.com/aws-actions/configure-aws-credentials/compare/v1.4.2...v1.4.3) (2020-07-14)


### Bug Fixes

* Make tagging optional ([#92](https://github.com/aws-actions/configure-aws-credentials/issues/92)) ([baf85d8](https://github.com/aws-actions/configure-aws-credentials/commit/baf85d8be969f190df9bc9153f06958c32ef3828))

### [1.4.2](https://github.com/aws-actions/configure-aws-credentials/compare/v1.4.1...v1.4.2) (2020-06-30)


### Bug Fixes

* add comma to set of special characters ([#78](https://github.com/aws-actions/configure-aws-credentials/issues/78)) ([f04843b](https://github.com/aws-actions/configure-aws-credentials/commit/f04843b510a6c8adf77eed907a616cf00a99970d))

### [1.4.1](https://github.com/aws-actions/configure-aws-credentials/compare/v1.4.0...v1.4.1) (2020-06-09)

## [1.4.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.3.5...v1.4.0) (2020-06-03)


### Features

* Refresh and validate credentials after setting env var creds ([#71](https://github.com/aws-actions/configure-aws-credentials/issues/71)) ([472e549](https://github.com/aws-actions/configure-aws-credentials/commit/472e549195ba1f153e9fb72e39dc2a094e5de13e))

### [1.3.5](https://github.com/aws-actions/configure-aws-credentials/compare/v1.3.4...v1.3.5) (2020-05-27)


### Bug Fixes

* clear session token env var if present for non-session credentials ([#65](https://github.com/aws-actions/configure-aws-credentials/issues/65)) ([0c2c1f7](https://github.com/aws-actions/configure-aws-credentials/commit/0c2c1f7c129971b6f433551b1f4ba4a6a9cc8b70))

### [1.3.4](https://github.com/aws-actions/configure-aws-credentials/compare/v1.3.3...v1.3.4) (2020-05-18)

### [1.3.3](https://github.com/aws-actions/configure-aws-credentials/compare/v1.3.2...v1.3.3) (2020-04-02)

### [1.3.2](https://github.com/aws-actions/configure-aws-credentials/compare/v1.3.1...v1.3.2) (2020-03-18)


### Bug Fixes

* let the AWS SDK determine the STS regional endpoint ([#48](https://github.com/aws-actions/configure-aws-credentials/issues/48)) ([fc72bd3](https://github.com/aws-actions/configure-aws-credentials/commit/fc72bd38dbe25493f5113760c9c6e1ef2f6f9a0e))

### [1.3.1](https://github.com/aws-actions/configure-aws-credentials/compare/v1.3.0...v1.3.1) (2020-03-06)


### Bug Fixes

* validate region input string ([#44](https://github.com/aws-actions/configure-aws-credentials/issues/44)) ([3d568d2](https://github.com/aws-actions/configure-aws-credentials/commit/3d568d2c4359304d46d9bd1b4d9f69e088ccbf7b))

## [1.3.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.2.0...v1.3.0) (2020-03-06)


### Features

* don't require access key credentials for self-hosted runners ([#42](https://github.com/aws-actions/configure-aws-credentials/issues/42)) ([a20ed60](https://github.com/aws-actions/configure-aws-credentials/commit/a20ed6025224ca999786c8d4e687f119cfedec65))

## [1.2.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.1.2...v1.2.0) (2020-03-06)


### Features

* Add option to provide external ID ([#32](https://github.com/aws-actions/configure-aws-credentials/issues/32)) ([1c435bb](https://github.com/aws-actions/configure-aws-credentials/commit/1c435bbd5e1f1d36cdd703da5c4d6ee1ad91efac)), closes [#28](https://github.com/aws-actions/configure-aws-credentials/issues/28)
* Have an ability to configure session name ([#29](https://github.com/aws-actions/configure-aws-credentials/issues/29)) ([4d0082a](https://github.com/aws-actions/configure-aws-credentials/commit/4d0082acf8b4102597f2570a056a320194f13e63))
* infer role ARN if given role name ([#35](https://github.com/aws-actions/configure-aws-credentials/issues/35)) ([96c6f7e](https://github.com/aws-actions/configure-aws-credentials/commit/96c6f7e07b5fabc5a907fce84745ea625eeb005d))


### Bug Fixes

* mask both source and role credentials ([#40](https://github.com/aws-actions/configure-aws-credentials/issues/40)) ([816f5cc](https://github.com/aws-actions/configure-aws-credentials/commit/816f5cc0cf79541b2a6d639e8f93ae43aadaf09c))

### [1.1.2](https://github.com/aws-actions/configure-aws-credentials/compare/v1.1.1...v1.1.2) (2020-02-12)


### Bug Fixes

* change sanitization character from '*' to '_' ([55f6a14](https://github.com/aws-actions/configure-aws-credentials/commit/55f6a14016cb47190b15751dcce450441bba35e3))

### [1.1.1](https://github.com/aws-actions/configure-aws-credentials/compare/v1.1.0...v1.1.1) (2020-02-07)

## [1.1.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.0.1...v1.1.0) (2020-02-06)


### Features

* add support for assuming a role ([#17](https://github.com/aws-actions/configure-aws-credentials/issues/17)) ([25960ab](https://github.com/aws-actions/configure-aws-credentials/commit/25960ab0950f92074b17fa0cb8ff33eeaa1615f0))
* Build and integ test scripts for pipeline ([52bc82a](https://github.com/aws-actions/configure-aws-credentials/commit/52bc82a29bb08f2f8f87a92f380149945eb8d6f1))


### Bug Fixes

* create workflows dir in integ-tests ([3de962e](https://github.com/aws-actions/configure-aws-credentials/commit/3de962edc9fe1169ff6032bef94b934be53211d1))
* remove buildspecs ([260c6cc](https://github.com/aws-actions/configure-aws-credentials/commit/260c6cc0ed07cbd8ff2a7a74066ad9f67ecc82f7))
* remove release script ([1436a16](https://github.com/aws-actions/configure-aws-credentials/commit/1436a160af84c3a086a812f98daf457a042274cb))
* resolve commit ID in integ test script ([77f2df7](https://github.com/aws-actions/configure-aws-credentials/commit/77f2df7a41882637145683bb1acf60bb04fddc24))
* sanitize AWS session tags ([#20](https://github.com/aws-actions/configure-aws-credentials/issues/20)) ([4faf8cd](https://github.com/aws-actions/configure-aws-credentials/commit/4faf8cd19a5b6cc50c9c66c89dd32d7e6e51bd8a))
* set role credentials as secrets to mask them in logs ([#19](https://github.com/aws-actions/configure-aws-credentials/issues/19)) ([e2fd53a](https://github.com/aws-actions/configure-aws-credentials/commit/e2fd53ab66a094843f790497dcc950894c245786))
