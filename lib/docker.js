const BbPromise = require('bluebird')
const { spawnSync } = require('child_process')
const _ = require('lodash')
const fse = require('fs-extra')
const path = require('path')
const util = require('util')
const { getDockerLoginToECRCommand } = require('./awscli')

/**
 * @returns {string} "<ECR Repo Name>:latest"
 */
function getDockerImageName () {
  return `${this.provider.naming.getECRRepositoryURL()}:latest`
}

/**
 * Helper function to run a docker command
 * @param {string[]} options
 * @param {string} cwd Current working directory
 * @return {Object}
 */
function dockerCommand (options, cwd = null, stdio = null) {
  const cmd = 'docker'
  var spawnOptions = {
    encoding: 'utf-8'
  }
  if (cwd != null) {
    spawnOptions.cwd = cwd
  }
  if (stdio != null) {
    spawnOptions.stdio = stdio
  }

  const ps = spawnSync(cmd, options, spawnOptions)
  if (ps.error) {
    if (ps.error.code === 'ENOENT') {
      throw new Error('docker not found! Please install it.')
    }
    throw new Error(ps.error)
  } else if (ps.status !== 0) {
    throw new Error(ps.stderr)
  }
  return ps
}

function buildDockerImage (additionalRunCommands = '') {
  const servicePath = this.serverless.config.servicePath || ''
  const packagePath = path.join(servicePath || '.', '.serverless', '../')
  const dockerfile = path.join(servicePath, 'Dockerfile')

  if (fse.existsSync(dockerfile)) {
    const dockerOptions = ['build', '-f', dockerfile, '-t', this.provider.naming.getDockerImageName(), '.']
    dockerCommand(dockerOptions, packagePath, 'inherit')
  }

  return BbPromise.resolve()
}

function buildDockerImageFromDockerfile () {
  this.serverless.cli.log(`Building docker image: "${this.provider.naming.getDockerImageName()}"...`)

  // Get any additional run commands we'd like to include in the docker image
  let additionalRunCommands = ''
  if (this.serverless.service.custom &&
        this.serverless.service.custom.awsBatch &&
        this.serverless.service.custom.awsBatch.additionalDockerRunCommands) {
    _.forEach(
      this.serverless.service.custom.awsBatch.additionalDockerRunCommands,
      runCommand => {
        additionalRunCommands += `RUN ${runCommand}\n`
      }
    )
  }

  // Override some of the default lambci environmental variables.
  //   - Function Timeout and Function Memory are set by Env Variables on the Job Definition
  //   - Access Key and Secret are unset to that we use the role on the container that AWS provides

  // const dockerFileContents = `
  //   FROM justinram11/lambda:build-${this.serverless.service.provider.runtime}
  //   USER root

  //   ${additionalRunCommands}
  //   COPY ${this.serverless.service.service}.zip /tmp
  //   RUN cd /tmp && unzip ${this.serverless.service.service}.zip && rm ${this.serverless.service.service}.zip

  //   FROM justinram11/lambda:${this.serverless.service.provider.runtime}
  //   COPY --from=0 /tmp/* /var/task/
  //   RUN rm -rf /tmp/*
  //   `

  const servicePath = this.serverless.config.servicePath || ''
  const packagePath = path.join(servicePath || '.', '.serverless')
  const dockerFile = path.join(packagePath, 'Dockerfile')
  fse.writeFileSync(dockerFile, dockerFileContents)

  const dockerOptions = ['build', '-f', dockerFile, '-t', this.provider.naming.getDockerImageName(), '.']
  dockerCommand(dockerOptions, packagePath, 'inherit')

  return BbPromise.resolve()
}

/**
 * Build the custom Docker image by copying our package to the /var/task directory
 * in the docker image.
 *
 * Our base image uses the Lambda Docker Image for the platform:
 * https://hub.docker.com/r/lambci/lambda/
 */
function buildCustomDockerImage () {
  this.serverless.cli.log(`Building docker image: "${this.provider.naming.getDockerImageName()}"...`)

  // Get any additional run commands we'd like to include in the docker image
  let additionalRunCommands = ''
  if (this.serverless.service.custom &&
        this.serverless.service.custom.awsBatch &&
        this.serverless.service.custom.awsBatch.additionalDockerRunCommands) {
    _.forEach(
      this.serverless.service.custom.awsBatch.additionalDockerRunCommands,
      runCommand => {
        additionalRunCommands += `RUN ${runCommand}\n`
      }
    )
  }

  // Override some of the default lambci environmental variables.
  //   - Function Timeout and Function Memory are set by Env Variables on the Job Definition
  //   - Access Key and Secret are unset to that we use the role on the container that AWS provides
  const dockerFileContents = `
    FROM justinram11/lambda:build-${this.serverless.service.provider.runtime}
    USER root
    
    ${additionalRunCommands}
    COPY ${this.serverless.service.service}.zip /tmp
    RUN cd /tmp && unzip ${this.serverless.service.service}.zip && rm ${this.serverless.service.service}.zip
    
    FROM justinram11/lambda:${this.serverless.service.provider.runtime}
    COPY --from=0 /tmp/* /var/task/
    RUN rm -rf /tmp/*
    `

  const servicePath = this.serverless.config.servicePath || ''
  const packagePath = path.join(servicePath || '.', '.serverless')
  const dockerFile = path.join(packagePath, 'Dockerfile')
  fse.writeFileSync(dockerFile, dockerFileContents)

  const dockerOptions = ['build', '-f', dockerFile, '-t', this.provider.naming.getDockerImageName(), '.']
  dockerCommand(dockerOptions, packagePath, 'inherit')

  return BbPromise.resolve()
}

/**
 * Uses docker to upload the image to ECR
 */
function pushDockerImageToECR () {
  // Log docker into our AWS ECR repo so that we can push images to it
  this.serverless.cli.log('Logging into ECR...')
  const loginCommand = getDockerLoginToECRCommand.bind(this)()
  dockerCommand(loginCommand.split(' '))

  // Then perform the upload
  this.serverless.cli.log('Uploading to ECR...')
  dockerCommand(['push', this.provider.naming.getECRRepositoryURL()], null, 'inherit')

  return BbPromise.resolve()
}

module.exports = {
  getDockerImageName,
  buildDockerImage,
  buildDockerImageFromDockerfile,
  pushDockerImageToECR
}
