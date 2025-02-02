'use strict'

const BbPromise = require('bluebird')
const fse = require('fs-extra')
const generateCoreTemplate = require('./lib/generateCoreTemplate')
const ecr = require('./lib/ecr')
const docker = require('./lib/docker')
const batchenvironment = require('./lib/batchenvironment')
const batchtask = require('./lib/batchtask')
const awscli = require('./lib/awscli')
const _ = require('lodash')

BbPromise.promisifyAll(fse)

class ServerlessAWSBatchOrka {
  constructor (serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    // Make sure that we add the names for our ECR, docker, and batch resources to the provider
    _.merge(
      this.provider.naming,
      {
        getECRLogicalId: ecr.getECRLogicalId,
        getECRRepositoryName: ecr.getECRRepositoryName,
        getECRRepositoryURL: ecr.getECRRepositoryURL,
        getDockerImageName: docker.getDockerImageName,
        getBatchServiceRoleLogicalId: batchenvironment.getBatchServiceRoleLogicalId,
        getBatchInstanceManagementRoleLogicalId: batchenvironment.getBatchInstanceManagementRoleLogicalId,
        getBatchInstanceManagementProfileLogicalId: batchenvironment.getBatchInstanceManagementProfileLogicalId,
        getBatchSpotFleetManagementRoleLogicalId: batchenvironment.getBatchSpotFleetManagementRoleLogicalId,
        getBatchJobExecutionRoleLogicalId: batchenvironment.getBatchJobExecutionRoleLogicalId,
        getLambdaScheduleExecutionRoleLogicalId: batchenvironment.getLambdaScheduleExecutionRoleLogicalId,
        getBatchComputeEnvironmentLogicalId: batchenvironment.getBatchComputeEnvironmentLogicalId,
        getBatchJobQueueLogicalId: batchenvironment.getBatchJobQueueLogicalId,
        getBatchJobQueueName: batchenvironment.getBatchJobQueueName,
        // getLogConfiguration: batchtask.getLoggingConfiguration,
        getJobDefinitionLogicalId: batchtask.getJobDefinitionLogicalId
      }
    )

    // Define inner lifecycles
    this.commands = {}

    this.hooks = {
      'after:package:initialize': () => BbPromise.bind(this)
        .then(generateCoreTemplate.generateCoreTemplate),

      'before:package:compileFunctions': () => BbPromise.bind(this)
        .then(batchenvironment.validateAWSBatchServerlessConfig)
        .then(batchenvironment.generateAWSBatchTemplate)
        .then(batchtask.compileBatchTasks),

      'after:package:createDeploymentArtifacts': () => BbPromise.bind(this)
        // .then(docker.buildDockerImageFromDockerfile),
        .then(docker.buildDockerImage),

      'before:aws:deploy:deploy:uploadArtifacts': () => BbPromise.bind(this)
        .then(docker.pushDockerImageToECR),

      'before:remove:remove': () => BbPromise.bind(this)
        .then(awscli.deleteAllDockerImagesInECR)
    }
  }
}

module.exports = ServerlessAWSBatchOrka
