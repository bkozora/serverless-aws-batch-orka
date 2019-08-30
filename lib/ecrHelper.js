const fs = require('fs')
const path = require('path')
const AWS = require('aws-sdk')
const { spawn } = require('child_process')

const ECR_REPO_NAME = process.env.ECR_REPO_NAME
const DOCKER_IMAGE_NAME = process.env.DOCKER_IMAGE_NAME

/**
 * Get the URI of the last docker image in a given repository.
 * @param  {String} repoName       ECR repository name
 * @param  {String} imageTagPrefix Docker image tags (optional)
 * @param  {String} profile        AWS profile (optional)
 * @return {String}                Last image URI
 */
async function getLastImageUri (repoName, imageTagPrefix = '', profile) {
  // Make it works with AWS profiles
  if (profile) {
    AWS.CredentialProviderChain.defaultProviders = [
      () => new AWS.EnvironmentCredentials('AWS'),
      () => new AWS.EnvironmentCredentials('AMAZON'),
      () => new AWS.SharedIniFileCredentials({ profile }),
      () => {
        if (AWS.ECSCredentials.prototype.isConfiguredForEcsCredentials()) {
          return new AWS.ECSCredentials()
        }
        return new AWS.EC2MetadataCredentials()
      }
    ]
    const credentials = await new AWS.CredentialProviderChain().resolvePromise()
    AWS.config.credentials = credentials
    return AWS
  }
  const ecr = new AWS.ECR()

  // Get the repository uri
  const { repositories } = await ecr.describeRepositories({
    repositoryNames: [repoName]
  }).promise()
  const repositoryUri = repositories[0].repositoryUri
  console.log('Repository uri: %s', repositoryUri)

  // List images
  let token
  let images = []
  do {
    const { imageDetails, nextToken } = await ecr.describeImages({
      repositoryName: repoName,
      nextToken: token
    }).promise()
    token = nextToken
    images = images.concat(imageDetails)
  } while (token)

  // Filter images, for this example we will simply take the first one
  // You can find a filtering by tags in the first revision of this gist:
  // https://gist.github.com/ChristopheBougere/d11ae9b11dbccfd13f4219b02bdeac6c/a36a66c8e88f700442fe4d8b15c04a45304680bb#file-serverless-helpers-js-L55
  const image = images[0]

  // Build the image uri
  const fullTag = image.imageTags[0] || ''
  const imageUri = `${repositoryUri}:${fullTag}`
  console.log('Image uri: %s', imageUri)

  return imageUri
}

/**
 * Return the last docker image URI corresponding to ECR_REPO_NAME and DOCKER_IMAGE_NAME
 * @param  {Object} serverless Serverless object
 * @return {String}            Last image URI
 */
async function getDockerImageUri (serverless) {
  return getLastImageUri(ECR_REPO_NAME, DOCKER_IMAGE_NAME, serverless.providers.aws.options['aws-profile'])
}

/**
 * Generate an AMI name composed of the date and the repo name
 * @return {String} AMI name
 */
function getAMIName () {
  return `ecs-${ECR_REPO_NAME}-${new Date().toISOString().replace(/-/g, '').substring(0, 8)}`
}

/**
 * Return the content of the `userData.sh` file
 * @return {String} The user data code
 */
async function getUserDataCode () {
  const content = await fs.readFileSync(path.join(__dirname, 'userData.sh'), 'utf8')
  return content.toString()
}

module.exports = {
  getDockerImageUri,
  getAMIName,
  getUserDataCode
}
