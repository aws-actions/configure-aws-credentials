# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [4.3.0](https://github.com/aws-actions/configure-aws-credentials/compare/v4.3.0...v4.3.0) (2025-08-04)


### Bug Fixes

* properly set proxy environment variable ([cbea708](https://github.com/aws-actions/configure-aws-credentials/commit/cbea70821e4ab985ad3be0e5a93390523e257cde))


### Miscellaneous Chores

* release 4.3.0 ([3f7c218](https://github.com/aws-actions/configure-aws-credentials/commit/3f7c2187213bafaa1ea60a850b27082cbf55dda0))

## [4.3.0](https://github.com/aws-actions/configure-aws-credentials/compare/v4.2.1...v4.3.0) (2025-08-04)


### Features

* depenency update and feature cleanup ([#1414](https://github.com/aws-actions/configure-aws-credentials/issues/1414)) ([59489ba](https://github.com/aws-actions/configure-aws-credentials/commit/59489ba544930000b7b67412c167f5fe816568cf)), closes [#1062](https://github.com/aws-actions/configure-aws-credentials/issues/1062) [#1191](https://github.com/aws-actions/configure-aws-credentials/issues/1191)
* Optional environment variable output ([c3b3ce6](https://github.com/aws-actions/configure-aws-credentials/commit/c3b3ce61b02510937ff02916a4eb153874bc5085))


### Bug Fixes

* **docs:** readme samples versioning ([5b3c895](https://github.com/aws-actions/configure-aws-credentials/commit/5b3c89504689ea1ea2b6000b23a6a2aac463662a))
* the wrong example region for China partition in README ([37fe9a7](https://github.com/aws-actions/configure-aws-credentials/commit/37fe9a740bcb30ee8cccd96feb90666c937311f2))
* properly set proxy environment variable ([cbea708](https://github.com/aws-actions/configure-aws-credentials/commit/cbea70821e4ab985ad3be0e5a93390523e257cde))


### Miscellaneous Chores

* release 4.3.0 ([3f7c218](https://github.com/aws-actions/configure-aws-credentials/commit/3f7c2187213bafaa1ea60a850b27082cbf55dda0))

## [4.2.1](https://github.com/aws-actions/configure-aws-credentials/compare/v4.2.0...v4.2.1) (2025-05-14)


### Bug Fixes

* ensure explicit inputs take precedence over environment variables ([e56e6c4](https://github.com/aws-actions/configure-aws-credentials/commit/e56e6c4038915cd5a7238a671fe97f44c98a40b0))
* prioritize explicit inputs over environment variables ([df9c8fe](https://github.com/aws-actions/configure-aws-credentials/commit/df9c8fed6b364f0d1fb0e6e03a0ec26f1ea4e3fc))

## [4.2.0](https://github.com/aws-actions/configure-aws-credentials/compare/v4.1.0...v4.2.0) (2025-05-06)


### Features

* add Expiration field to Outputs ([a4f3267](https://github.com/aws-actions/configure-aws-credentials/commit/a4f326760c1c1bf49ab86051c658d6501816b930))
* Document role-duration-seconds range ([5a0cf01](https://github.com/aws-actions/configure-aws-credentials/commit/5a0cf0167f837dfa7af7d951ba6a78a38dc2b79e))
* support action inputs as environment variables ([#1338](https://github.com/aws-actions/configure-aws-credentials/issues/1338)) ([2c168ad](https://github.com/aws-actions/configure-aws-credentials/commit/2c168adcae62d67531ba83842723c8f30695116a))


### Bug Fixes

* make sure action builds, also fix dependabot autoapprove ([c401b8a](https://github.com/aws-actions/configure-aws-credentials/commit/c401b8a98c5067672f52e0387cdd87d54acfe1fd))
* role chaning on mulitple runs ([#1340](https://github.com/aws-actions/configure-aws-credentials/issues/1340)) ([9e38641](https://github.com/aws-actions/configure-aws-credentials/commit/9e386419117a9edd458297e4f1822a5df7506a03))

## [4.1.0](https://github.com/aws-actions/configure-aws-credentials/compare/v4.0.3...v4.1.0) (2025-02-08)


### Features

* idempotent fetch ([#1289](https://github.com/aws-actions/configure-aws-credentials/issues/1289)) ([eb70354](https://github.com/aws-actions/configure-aws-credentials/commit/eb70354fb423a380b6e4ab4b9f15d2ee9ffae911))


### Bug Fixes

* build failure due to tests ([#1283](https://github.com/aws-actions/configure-aws-credentials/issues/1283)) ([134d71e](https://github.com/aws-actions/configure-aws-credentials/commit/134d71efe0ecbe9ad6965f2f766c0cae63a7685f))
* Dependabot autoapprove ([#1284](https://github.com/aws-actions/configure-aws-credentials/issues/1284)) ([b9ee51d](https://github.com/aws-actions/configure-aws-credentials/commit/b9ee51dc600fe38c892e24f60ca26476e0e0b6de))
* Dependabot autoapprove id-token write permission ([#1285](https://github.com/aws-actions/configure-aws-credentials/issues/1285)) ([f0af89b](https://github.com/aws-actions/configure-aws-credentials/commit/f0af89b102390dcf10ce402195d74a98f24861f3))
* typo ([#1281](https://github.com/aws-actions/configure-aws-credentials/issues/1281)) ([39fd91c](https://github.com/aws-actions/configure-aws-credentials/commit/39fd91c08ed8bf770034de4e62662503e8007d76))

## [4.0.3](https://github.com/aws-actions/configure-aws-credentials/compare/v4.0.2...v4.0.3) (2025-01-27)


### Features

* added release-please action config ([0f88004](https://github.com/aws-actions/configure-aws-credentials/commit/0f88004d9c27e0bdbbc254b3f7c8053cb38f04d7))


### Bug Fixes

* add id-token permission to automerge ([97834a4](https://github.com/aws-actions/configure-aws-credentials/commit/97834a484a5ab3c40fa9e2eb40fcf8041105a573))
* cpy syntax on npm package ([#1195](https://github.com/aws-actions/configure-aws-credentials/issues/1195)) ([83b5a56](https://github.com/aws-actions/configure-aws-credentials/commit/83b5a565471214aec459e234bef606339fe07111))
* force push packaged files to main ([bfd2185](https://github.com/aws-actions/configure-aws-credentials/commit/bfd218503eb87938c29603a551e19c6b594f5fe5))


### Miscellaneous Chores

* release 4.0.3 ([ca00fd4](https://github.com/aws-actions/configure-aws-credentials/commit/ca00fd4d3842ad58c3c21ebfe69defa1f0e7bdc4))

## [4.0.2](https://github.com/aws-actions/configure-aws-credentials/compare/v4.0.1...v4.0.2) (2024-02-09)

* Revert 4.0.1 to remove warning

## [4.0.1](https://github.com/aws-actions/configure-aws-credentials/compare/v4.0.0...v4.0.1) (2023-10-03)

### Documentation
*  Throw a warning when customers use long-term credentials.

## [4.0.0](https://github.com/aws-actions/configure-aws-credentials/compare/v3.0.2...v4.0.0) (2023-09-11)

* Upgraded runtime to `node20` from `node16`

## [3.0.2](https://github.com/aws-actions/configure-aws-credentials/compare/v3.0.1...v3.0.2) (2023-09-07)

### Bug Fixes
* fixes #817 #819: validation logic throwing unwanted errors [d78f55b](https://github.com/aws-actions/configure-aws-credentials/commit/d78f55b1db65186cb251a8504ae9527af06fc5fd)

## [3.0.1](https://github.com/aws-actions/configure-aws-credentials/compare/v3.0.0...v3.0.1) (2023-08-24)

### Features
* Can configure `special-characters-workaround` to keep retrying credentials if the returned
  credentials have special characters (Fixes #599)

### Bug Fixes
* Fixes #792: Action fails when intending to use existing credentials
* Minor typo fix from @ubaid-ansari21

### Changes to existing functionality
* Special characters are now allowed in returned credential variables unless you configure the
  `special-characters-workaround` option

## [3.0.0](https://github.com/aws-actions/configure-aws-credentials/compare/v2.2.0...v3.0.0) (2023-08-21)

### Features
* Can configure `max-retries` and `disable-retry` to modify retry functionality when the assume role call fails
* Set returned credentials as step outputs with `output-credentials`
* Clear AWS related environment variables at the start of the action with `unset-current-credentials`
* Unique role identifier is now printed in the workflow logs

### Bug Fixes
* Can't use credentials if they contain a special character
* Retry functionality added when generating the JWT fails
* Can now use `webIdentityTokenFile` option
* Branch name validation too strict
* JS SDK v2 deprecation warning in workflow logs

### Changes to existing functionality
* Default session duration is now 1 hour in all cases (from 6 hours in some cases)
* Account ID will not be masked by default in logs

## [2.2.0](https://github.com/aws-actions/configure-aws-credentials/compare/v2.1.0...v2.2.0) (2023-05-31)

### Features
* `inline-session-policy` prop enables assuming a role with inline session policies ([d00f6c6](https://github.com/aws-actions/configure-aws-credentials/commit/d00f6c6f41fde02a9fd0d469040be6ed0df69e73))
* `managed-session-policies` prop enables assuming a role with managed policy arns ([d00f6c6](https://github.com/aws-actions/configure-aws-credentials/commit/d00f6c6f41fde02a9fd0d469040be6ed0df69e73))

## [2.1.0](https://github.com/aws-actions/configure-aws-credentials/compare/v2.0.0...v2.1.0) (2023-05-31)

### Features
* `role-chaining` prop enables role chaining use case ([6fbd316](https://github.com/aws-actions/configure-aws-credentials/commit/6fbd316fd15f52c3d9f68e7aa06eae4f5699a518))

## [2.0.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.7.0...v2.0.0) (2023-03-06)

### Features
* Version bump to use Node 16 by default. 

## [1.7.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.6.1...v1.7.0) (2022-08-03)


### Features

* Allow audience to be explicitly specified ([2f8dfd0](https://github.com/aws-actions/configure-aws-credentials/commit/2f8dfd0ed43d880f85b57f0c8727b497af2037de))

### [1.6.1](https://github.com/aws-actions/configure-aws-credentials/compare/v1.6.0...v1.6.1) (2022-01-18)


### Bug Fixes

* OIDC Parallel Requests error ([133757e](https://github.com/aws-actions/configure-aws-credentials/commit/133757e9b829f4ef44c8e99e3f272879b45fc9c5))
* Strict Mode Deprecation ([4c5e1c6](https://github.com/aws-actions/configure-aws-credentials/commit/4c5e1c60ccfc95d0e48bf1bc95fc707a94aa2c60))

## [1.6.0](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.11...v1.6.0) (2021-11-23)


### Features

* Add the ability to use a web identity token file ([#240](https://github.com/aws-actions/configure-aws-credentials/issues/240)) ([8053174](https://github.com/aws-actions/configure-aws-credentials/commit/8053174404968575ac1dd102dcb1109d2fe6d9ea))
* added OIDC ([#262](https://github.com/aws-actions/configure-aws-credentials/issues/262)) ([b8c74de](https://github.com/aws-actions/configure-aws-credentials/commit/b8c74de753fbcb4868bf2011fb2e15826ce973af)), closes [#267](https://github.com/aws-actions/configure-aws-credentials/issues/267)
* upgraded to new GH OIDC API ([#284](https://github.com/aws-actions/configure-aws-credentials/issues/284)) ([036a4a1](https://github.com/aws-actions/configure-aws-credentials/commit/036a4a1ddf2c0e7a782dca6e083c6c53e5d90321))


### Bug Fixes

* reverting update to use new API ([#274](https://github.com/aws-actions/configure-aws-credentials/issues/274)) ([a78fcb0](https://github.com/aws-actions/configure-aws-credentials/commit/a78fcb01f76c8c5c3b05ab82718a6f7919fc0269)), closes [#270](https://github.com/aws-actions/configure-aws-credentials/issues/270)
* typo "charcters" in README.md ([#241](https://github.com/aws-actions/configure-aws-credentials/issues/241)) ([c48e1b5](https://github.com/aws-actions/configure-aws-credentials/commit/c48e1b578416f3457ccf757c47385df5c054d23f))
* Updated token retrieval to use new API ([#270](https://github.com/aws-actions/configure-aws-credentials/issues/270)) ([20ce4e5](https://github.com/aws-actions/configure-aws-credentials/commit/20ce4e5ba1de2e753d034b5415075a8767d64d4d))

### [1.5.11](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.10...v1.5.11) (2021-07-19)

### [1.5.10](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.9...v1.5.10) (2021-06-01)


### Bug Fixes

* skips session tagging ([#209](https://github.com/aws-actions/configure-aws-credentials/issues/209)) ([4900858](https://github.com/aws-actions/configure-aws-credentials/commit/4900858c22f8f07170e3032d4105f99c2aafa9e7))

### [1.5.9](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.8...v1.5.9) (2021-05-10)

### [1.5.8](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.7...v1.5.8) (2021-03-02)

### [1.5.7](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.6...v1.5.7) (2021-02-08)

### [1.5.6](https://github.com/aws-actions/configure-aws-credentials/compare/v1.5.5...v1.5.6) (2021-01-26)

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
