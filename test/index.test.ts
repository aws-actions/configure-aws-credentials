import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AssumeRoleCommand,
  AssumeRoleWithWebIdentityCommand,
  GetCallerIdentityCommand,
  STSClient
} from "@aws-sdk/client-sts"
import { fs, vol } from "memfs"
import * as core from "@actions/core"
import mocks from "./mockinputs.test"
import { mockClient } from "aws-sdk-client-mock"
import { run } from "../src/index"
import { CredentialsClient } from "../src/CredentialsClient"
import { before } from "node:test"

const mockedSTSClient = mockClient(STSClient)

describe("Configure AWS Credentials", {}, () => {
  beforeEach(() => {
    // Reset mock state
    vi.restoreAllMocks()
    mockedSTSClient.reset()
    // Mock GitHub Actions core functions
    vi.spyOn(core, "exportVariable").mockImplementation((_n, _v) => {})
    vi.spyOn(core, "setSecret").mockImplementation(_s => {})
    vi.spyOn(core, "setFailed").mockImplementation(_m => {})
    vi.spyOn(core, "setOutput").mockImplementation((_n, _v) => {})
    vi.spyOn(core, "debug").mockImplementation(_m => {})
    vi.spyOn(core, "info").mockImplementation(_m => {})
    // Remove any existing environment variables before each test to prevent the
    // SDK from picking them up
    process.env = { ...mocks.envs }
  })

  describe("GitHub OIDC Authentication", {}, () => {
    beforeEach(() => {
      vi.clearAllMocks()
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS))
      vi.spyOn(core, "getIDToken").mockResolvedValue("testoidctoken")
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY })
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = "fake-token"
    })
    it("exports environment variables", async () => {
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS)
      await run()
      expect(core.info).toHaveBeenCalledWith("Assuming role with OIDC")
      expect(core.info).toHaveBeenCalledTimes(2)
      expect(core.setOutput).toHaveBeenCalledWith("aws-account-id", "111111111111")
      expect(core.setOutput).toHaveBeenCalledOnce()
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSESSIONTOKEN")
      expect(core.setSecret).toHaveBeenCalledTimes(3)
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "STSAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "STSAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SESSION_TOKEN", "STSAWSSESSIONTOKEN")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_DEFAULT_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledTimes(5)
      expect(core.setFailed).not.toHaveBeenCalled()
    })
    it("handles the special character workaround", async () => {
      mockedSTSClient
        .on(AssumeRoleWithWebIdentityCommand)
        .resolvesOnce(mocks.outputs.ODD_CHARACTER_CREDENTIALS)
        .resolvesOnce(mocks.outputs.STS_CREDENTIALS)
      await run()
      expect(core.info).toHaveBeenCalledWith("Assuming role with OIDC")
      expect(core.info).toHaveBeenCalledWith("Assuming role with OIDC")
      expect(core.info).toHaveBeenCalledTimes(3)
      expect(core.setOutput).toHaveBeenCalledWith("aws-account-id", "111111111111")
      expect(core.setOutput).toHaveBeenCalledOnce()
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSESSIONTOKEN")
      expect(core.setSecret).toHaveBeenCalledTimes(3)
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "STSAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "STSAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SESSION_TOKEN", "STSAWSSESSIONTOKEN")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_DEFAULT_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledTimes(5)
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  describe("IAM User Authentication", {}, () => {
    beforeEach(() => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS))
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY })
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, "loadCredentials").mockResolvedValueOnce({
        accessKeyId: "MYAWSACCESSKEYID"
      })
    })
    it("exports environment variables", async () => {
      await run()
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "MYAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "MYAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_DEFAULT_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledTimes(4)
      expect(core.setSecret).toHaveBeenCalledWith("MYAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("MYAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledTimes(2)
      expect(core.setOutput).toHaveBeenCalledWith("aws-account-id", "111111111111")
      expect(core.setOutput).toHaveBeenCalledOnce()
      expect(core.info).toHaveBeenCalledWith("Proceeding with IAM user credentials")
      expect(core.info).toHaveBeenCalledOnce()
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  describe("AssumeRole with IAM LTC", {}, () => {
    beforeEach(() => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS))
      mockedSTSClient.on(AssumeRoleCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS)
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY }) // 3 times
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, "loadCredentials")
        .mockResolvedValueOnce({ accessKeyId: "MYAWSACCESSKEYID" })
        .mockResolvedValueOnce({ accessKeyId: "STSAWSACCESSKEYID" })
    })
    it("exports environment variables", async () => {
      await run()
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_DEFAULT_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "MYAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "MYAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "STSAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "STSAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SESSION_TOKEN", "STSAWSSESSIONTOKEN")
      expect(core.exportVariable).toHaveBeenCalledTimes(7)
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSESSIONTOKEN")
      expect(core.setSecret).toHaveBeenCalledWith("MYAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("MYAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledTimes(5)
      expect(core.setOutput).toHaveBeenCalledWith("aws-account-id", "111111111111")
      expect(core.setOutput).toHaveBeenCalledTimes(2)
      expect(core.info).toHaveBeenCalledWith("Assuming role with user credentials")
      expect(core.info).toHaveBeenCalledTimes(2)
    })
  })

  describe("AssumeRole with WebIdentityTokeFile", {}, () => {
    beforeEach(() => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.WEBIDENTITY_TOKEN_FILE_INPUTS))
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS)
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY })
      vi.mock("node:fs")
      vol.reset()
      fs.mkdirSync("/home/github", { recursive: true })
      fs.writeFileSync("/home/github/file.txt", "test-token")
    })
    it("exports environment variables", async () => {
      await run()
      expect(core.info).toHaveBeenCalledWith("Assuming role with web identity token file")
      expect(core.info).toHaveBeenCalledTimes(2)
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_DEFAULT_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "STSAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "STSAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SESSION_TOKEN", "STSAWSSESSIONTOKEN")
      expect(core.exportVariable).toHaveBeenCalledTimes(5)
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSESSIONTOKEN")
      expect(core.setSecret).toHaveBeenCalledTimes(3)
      expect(core.setOutput).toHaveBeenCalledWith("aws-account-id", "111111111111")
      expect(core.setOutput).toHaveBeenCalledTimes(1)
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  describe("Assume existing role", {}, () => {
    beforeEach(() => {
      mockedSTSClient.on(AssumeRoleCommand).resolves(mocks.outputs.STS_CREDENTIALS)
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY })
      process.env = { ...mocks.envs }
    })
    it("exports environment variables from env variables", async () => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.EXISTING_ROLE_INPUTS))
      process.env.AWS_ACCESS_KEY_ID = "MYAWSACCESSKEYID"
      process.env.AWS_SECRET_ACCESS_KEY = "MYAWSSECRETACCESSKEY"
      process.env.AWS_SESSION_TOKEN = "MYAWSSESSIONTOKEN"
      await run()
      expect(core.info).toHaveBeenCalledWith("Assuming role with user credentials")
      expect(core.info).toHaveBeenCalledTimes(2)
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_DEFAULT_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "STSAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "STSAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SESSION_TOKEN", "STSAWSSESSIONTOKEN")
      expect(core.exportVariable).toHaveBeenCalledTimes(5)
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSESSIONTOKEN")
      expect(core.setSecret).toHaveBeenCalledTimes(3)
      expect(core.setOutput).toHaveBeenCalledWith("aws-account-id", "111111111111")
      expect(core.setOutput).toHaveBeenCalledTimes(2)
      expect(core.setFailed).not.toHaveBeenCalled()
    })
    it("exports environment variables from inputs", {}, async () => {
      vi.spyOn(core, "getInput").mockImplementation(
        mocks.getInput({
          ...mocks.EXISTING_ROLE_INPUTS,
          "aws-access-key-id": "MYAWSACCESSKEYID",
          "aws-secret-access-key": "MYAWSSECRETACCESSKEY",
          "aws-session-token": "MYAWSSESSIONTOKEN"
        })
      )
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, "loadCredentials")
        .mockResolvedValueOnce({
          accessKeyId: "MYAWSACCESSKEYID"
        })
        .mockResolvedValueOnce({ accessKeyId: "STSAWSACCESSKEYID" })
      await run()
      expect(core.info).toHaveBeenCalledWith("Assuming role with user credentials")
      expect(core.info).toHaveBeenCalledTimes(2)
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_DEFAULT_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_REGION", "fake-region-1")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID", "STSAWSACCESSKEYID")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SECRET_ACCESS_KEY", "STSAWSSECRETACCESSKEY")
      expect(core.exportVariable).toHaveBeenCalledWith("AWS_SESSION_TOKEN", "STSAWSSESSIONTOKEN")
      expect(core.exportVariable).toHaveBeenCalledTimes(8)
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSACCESSKEYID")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSECRETACCESSKEY")
      expect(core.setSecret).toHaveBeenCalledWith("STSAWSSESSIONTOKEN")
      expect(core.setSecret).toHaveBeenCalledTimes(6)
      expect(core.setOutput).toHaveBeenCalledWith("aws-account-id", "111111111111")
      expect(core.setOutput).toHaveBeenCalledTimes(2)
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  describe("Odd inputs", {}, () => {
    it("fails when github env vars are missing", {}, async () => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS))
      delete process.env.GITHUB_REPOSITORY
      delete process.env.GITHUB_SHA
      await run()
      expect(core.setFailed).toHaveBeenCalled()
    })
    it("does not fail if GITHUB_REF is missing", {}, async () => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS))
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY })
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, "loadCredentials").mockResolvedValueOnce({
        accessKeyId: "MYAWSACCESSKEYID"
      })
      delete process.env.GITHUB_REF
      await run()
      expect(core.setFailed).not.toHaveBeenCalled()
    })
    it("fails with an invalid region", {}, async () => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput({ "aws-region": "$|<1B1D1 701L37" }))
      await run()
      expect(core.setFailed).toHaveBeenCalled()
    })
    it("fails if access key id is provided without secret access key", {}, async () => {
      vi.spyOn(core, "getInput").mockImplementation(
        mocks.getInput({ ...mocks.IAM_USER_INPUTS, "aws-secret-access-key": "" })
      )
      await run()
      expect(core.setFailed).toHaveBeenCalled()
    })
    it("handles improper retry-max-attempts input", {}, async () => {
      // This should mean we retry one time
      vi.spyOn(core, "getInput").mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          "retry-max-attempts": "-1",
          "special-characters-workaround": "false"
        })
      )
      vi.spyOn(core, "getIDToken").mockResolvedValue("testoidctoken")
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY })
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = "fake-token"
      mockedSTSClient
        .on(AssumeRoleWithWebIdentityCommand)
        .rejectsOnce(new Error("test error"))
        .rejectsOnce(new Error("test error"))
        .resolvesOnce(mocks.outputs.STS_CREDENTIALS)
      await run()
      expect(core.setFailed).toHaveBeenCalled()
    })
    it("fails if doing OIDC without the ACTIONS_ID_TOKEN_REQUEST_TOKEN", {}, async () => {
      vi.spyOn(core, "getInput").mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS))
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
      await run()
      expect(core.setFailed).toHaveBeenCalled()
    })
  })
})
