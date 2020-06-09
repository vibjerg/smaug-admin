#!groovy​

properties([
        buildDiscarder(logRotator(artifactDaysToKeepStr: '', artifactNumToKeepStr: '', daysToKeepStr: '', numToKeepStr: '10')),
        pipelineTriggers([]),
        disableConcurrentBuilds()
])

def PRODUCT = "smaug-admin"
def CONTAINER_NAME = "${PRODUCT}-${BRANCH_NAME.toLowerCase()}"
def BUILD_NAME = "$PRODUCT :: $BRANCH_NAME"
def DOCKER_REPO = "docker-ux.dbc.dk"
def IMAGE_NAME = "${DOCKER_REPO}/${CONTAINER_NAME}"
def DOCKER_NAME = "${IMAGE_NAME}:${BUILD_NUMBER}"
def DOCKER_COMPOSE_NAME = "compose-${DOCKER_NAME}"
def DOCKER_STATUS = ''
pipeline {
    agent {
        label 'devel9-head'
    }
    stages {
        stage('Test and build image') {
            steps {
                script {
                    sh "docker build -t $DOCKER_NAME --pull --no-cache ."
                }
            }
        }
        stage('Integration test') {
            steps {
                script {
                  ansiColor("xterm") {
                    sh "echo Integrating..."
                    sh "docker-compose -f docker-compose-cypress.yml -p ${DOCKER_COMPOSE_NAME} build"
                    sh "IMAGE=${DOCKER_NAME} docker-compose -f docker-compose-cypress.yml -p ${DOCKER_COMPOSE_NAME} run e2e"
                  }
                }
            }
        }
        stage('Push to Artifactory') {
            when {
                branch "master"
            }
            steps {
                script {
                    if (currentBuild.resultIsBetterOrEqualTo('SUCCESS')) {
                        def ARTY_SERVER = Artifactory.server 'arty'
                        def ARTY_DOCKER = Artifactory.docker server: ARTY_SERVER, host: env.DOCKER_HOST
                        def BUILD_INFO = Artifactory.newBuildInfo()
                        BUILD_INFO.name = BUILD_NAME
                        BUILD_INFO.env.capture = true
                        BUILD_INFO.env.collect()
                        BUILD_INFO = ARTY_DOCKER.push("$DOCKER_NAME", 'docker-ux', BUILD_INFO)
                        ARTY_SERVER.publishBuildInfo BUILD_INFO
                    }
                }
            }
        }
    }
    post {
        always {
            script {
                sh """
                    CONTAINER_ID=`docker ps | grep $DOCKER_NAME | awk '{print \$1}'`
                    docker kill \$CONTAINER_ID
                    docker rm \$CONTAINER_ID
                    IMAGE_ID=`docker images -a | grep $IMAGE_NAME | grep " $BUILD_NUMBER " | awk '{print \$3}'`
                    docker rmi \$IMAGE_ID
                """
            }
        }
    }
}