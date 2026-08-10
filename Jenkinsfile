// CI + Docker deploy. Node가 Jenkins agent PATH에 없으면 작업 공간에만
// 내려받아 relay 검사에 사용한다. 실제 서비스 빌드는 Docker 안에서 수행한다.
def runCmd(cmd) {
  if (isUnix()) {
    sh cmd
  } else {
    bat cmd
  }
}

def NODE_VERSION = 'v22.11.0'

pipeline {
  agent any

  options {
    skipDefaultCheckout(true)
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  environment {
    IMAGE_NAME = 'sixer'
    WEB_CONTAINER_NAME = 'sixer-web'
    DISCORD_CONTAINER_NAME = 'sixer-discord'
    WEB_PORT_MAPPING = '31001:3000'
    DISCORD_PORT_MAPPING = '31002:3001'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Setup Node') {
      steps {
        script {
          if (isUnix()) {
            def hasNode = sh(script: 'command -v node', returnStatus: true) == 0
            if (!hasNode) {
              echo "Node.js not found on PATH — downloading a local copy (${NODE_VERSION}) for this build."
              def arch = sh(script: 'uname -m', returnStdout: true).trim()
              def nodeArch = (arch == 'aarch64' || arch == 'arm64') ? 'arm64' : 'x64'
              def nodeDir = "node-${NODE_VERSION}-linux-${nodeArch}"
              sh """
                rm -rf .node-runtime
                mkdir -p .node-runtime
                curl -fsSL https://nodejs.org/dist/${NODE_VERSION}/${nodeDir}.tar.xz -o node.tar.xz
                tar -xJf node.tar.xz -C .node-runtime --strip-components=1
                rm node.tar.xz
              """
              env.PATH = "${WORKSPACE}/.node-runtime/bin:${env.PATH}"
            }
          } else {
            def hasNode = bat(script: 'where node', returnStatus: true) == 0
            if (!hasNode) {
              error "Node.js isn't on PATH on this Windows agent. Install Node.js on the agent."
            }
          }
        }
        runCmd 'node -v'
        runCmd 'npm -v'
      }
    }

    stage('Install and verify') {
      steps {
        runCmd 'npm ci'
        runCmd 'npm run check'
      }
    }

    stage('Docker Build') {
      steps {
        // application id는 공개값이며 Discord Activity 번들 생성에만 쓰인다.
        withCredentials([string(credentialsId: 'discord-app-id', variable: 'DISCORD_APP_ID')]) {
          sh '''
            docker build \
              --build-arg DISCORD_APP_ID="${DISCORD_APP_ID}" \
              -t ${IMAGE_NAME} .
          '''
        }
      }
    }

    stage('Deploy') {
      steps {
        withCredentials([
          string(credentialsId: 'discord-app-id', variable: 'DISCORD_APP_ID'),
          string(credentialsId: 'discord-client-secret', variable: 'DISCORD_CLIENT_SECRET'),
        ]) {
          sh '''
            docker stop ${WEB_CONTAINER_NAME} || true
            docker rm ${WEB_CONTAINER_NAME} || true
            docker run -d \
              --name ${WEB_CONTAINER_NAME} \
              --restart always \
              -p ${WEB_PORT_MAPPING} \
              ${IMAGE_NAME}

            docker stop ${DISCORD_CONTAINER_NAME} || true
            docker rm ${DISCORD_CONTAINER_NAME} || true
            docker run -d \
              --name ${DISCORD_CONTAINER_NAME} \
              --restart always \
              -p ${DISCORD_PORT_MAPPING} \
              -e DISCORD_APP_ID="${DISCORD_APP_ID}" \
              -e DISCORD_CLIENT_SECRET="${DISCORD_CLIENT_SECRET}" \
              ${IMAGE_NAME} node server/discord.js
          '''
        }
      }
    }
  }
}
