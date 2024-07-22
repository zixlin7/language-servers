import { CodeWhispererStreaming, ExportIntent } from '@amzn/codewhisperer-streaming'
import { Logging, Workspace } from '@aws/language-server-runtimes/server-interface'
import * as fs from 'fs'
import got from 'got'
import { v4 as uuidv4 } from 'uuid'
import {
    CreateUploadUrlResponse,
    GetTransformationRequest,
    StopTransformationRequest,
} from '../../client/token/codewhispererbearertokenclient'
import { CodeWhispererServiceToken } from '../codeWhispererService'
import { ArtifactManager } from './artifactManager'
import { getCWStartTransformRequest, getCWStartTransformResponse } from './converter'
import {
    CancelTransformRequest,
    CancelTransformResponse,
    CancellationJobStatus,
    DownloadArtifactsResponse,
    GetTransformPlanRequest,
    GetTransformPlanResponse,
    GetTransformRequest,
    GetTransformResponse,
    StartTransformRequest,
    StartTransformResponse,
    TransformProjectMetadata,
} from './models'
import * as validation from './validation'
import path = require('path')
import AdmZip = require('adm-zip')
import { Console } from 'console'
import { supportedProjects, unsupportedViewComponents } from './resources/SupportedProjects'
import { String } from 'aws-sdk/clients/codebuild'
import { ProjectMetadata } from 'aws-sdk/clients/lookoutvision'
import { httpstatus } from 'aws-sdk/clients/glacier'

const workspaceFolderName = 'artifactWorkspace'

export class TransformHandler {
    private client: CodeWhispererServiceToken
    private workspace: Workspace
    private logging: Logging
    constructor(client: CodeWhispererServiceToken, workspace: Workspace, logging: Logging) {
        this.client = client
        this.workspace = workspace
        this.logging = logging
    }

    async startTransformation(userInputrequest: StartTransformRequest): Promise<StartTransformResponse> {
        var unsupportedProjects: string[] = []
        const isProject = validation.isProject(userInputrequest)
        const containsUnsupportedViews = await validation.checkForUnsupportedViews(userInputrequest, isProject)
        /*
        if (isProject) {
            let isValid = validation.validateProject(userInputrequest)
            if (!isValid) {
                return {
                    Error: 'NotSupported',
                    IsSupported: false,
                    ContainsUnsupportedViews: containsUnsupportedViews,
                } as StartTransformResponse
            }
        } else {
            unsupportedProjects = validation.validateSolution(userInputrequest)
        }
*/
        const artifactManager = new ArtifactManager(
            this.workspace,
            this.logging,
            this.getWorkspacePath(userInputrequest.SolutionRootPath)
        )
        try {
            const payloadFilePath = await this.zipCodeAsync(userInputrequest, artifactManager)
            this.logging.log('payload path: ' + payloadFilePath)

            const uploadId = await this.preTransformationUploadCode(payloadFilePath)
            const request = getCWStartTransformRequest(userInputrequest, uploadId)
            this.logging.log('send request to start transform api: ' + JSON.stringify(request))
            const response = await this.client.codeModernizerStartCodeTransformation(request)
            this.logging.log('response start transform api: ' + JSON.stringify(response))
            return getCWStartTransformResponse(
                response,
                uploadId,
                payloadFilePath,
                unsupportedProjects,
                containsUnsupportedViews
            )
        } catch (error) {
            const errorMessage = (error as Error).message ?? 'Error in StartTransformation API call'
            this.logging.log(errorMessage)
            throw new Error(errorMessage)
        } finally {
            artifactManager.cleanup()
        }
    }

    async preTransformationUploadCode(payloadFilePath: string): Promise<string> {
        try {
            const uploadId = await this.uploadPayloadAsync(payloadFilePath)
            this.logging.log('artifact successfully uploaded. upload tracking id: ' + uploadId)
            return uploadId
        } catch (error) {
            const errorMessage = (error as Error).message ?? 'Failed to upload zip file'
            throw new Error(errorMessage)
        }
    }

    async uploadPayloadAsync(payloadFileName: string): Promise<string> {
        const sha256 = ArtifactManager.getSha256(payloadFileName)
        let response: CreateUploadUrlResponse
        try {
            response = await this.client.codeModernizerCreateUploadUrl({
                contentChecksum: sha256,
                contentChecksumType: 'SHA_256',
                uploadIntent: 'TRANSFORMATION',
            })
        } catch (e: any) {
            const errorMessage = (e as Error).message ?? 'Error in CreateUploadUrl API call'
            this.logging.log('Error when creating Upload url: ' + errorMessage)
            throw new Error(errorMessage)
        }

        try {
            await this.uploadArtifactToS3Async(payloadFileName, response, sha256)
        } catch (e: any) {
            const errorMessage = (e as Error).message ?? 'Error in uploadArtifactToS3 call'
            this.logging.log('Error when calling uploadArtifactToS3Async: ' + errorMessage)
            throw new Error(errorMessage)
        }
        return response.uploadId
    }

    async zipCodeAsync(request: StartTransformRequest, artifactManager: ArtifactManager): Promise<string> {
        try {
            return await artifactManager.createZip(request)
        } catch (e: any) {
            this.logging.log('cause:' + e)
        }
        return ''
    }

    async uploadArtifactToS3Async(fileName: string, resp: CreateUploadUrlResponse, sha256: string) {
        const headersObj = this.getHeadersObj(sha256, resp.kmsKeyArn)
        try {
            const response = await got.put(resp.uploadUrl, {
                body: fs.readFileSync(fileName),
                headers: headersObj,
            })

            this.logging.log(`CodeTransform: Response from S3 Upload = ${response.statusCode}`)
        } catch (e: any) {
            const errorMessage = (e as Error).message ?? 'Error in S3 UploadZip API call'

            this.logging.log(errorMessage)
        }
    }

    getHeadersObj(sha256: string, kmsKeyArn: string | undefined) {
        let headersObj = {}
        if (kmsKeyArn === undefined || kmsKeyArn.length === 0) {
            headersObj = {
                'x-amz-checksum-sha256': sha256,
                'Content-Type': 'application/zip',
            }
        } else {
            headersObj = {
                'x-amz-checksum-sha256': sha256,
                'Content-Type': 'application/zip',
                'x-amz-server-side-encryption': 'aws:kms',
                'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyArn,
            }
        }
        return headersObj
    }
    async getTransformation(request: GetTransformRequest) {
        try {
            const getCodeTransformationRequest = {
                transformationJobId: request.TransformationJobId,
            } as GetTransformationRequest
            this.logging.log('send request to get transform api: ' + JSON.stringify(getCodeTransformationRequest))
            const response = await this.client.codeModernizerGetCodeTransformation(getCodeTransformationRequest)
            this.logging.log('response received from get transform api: ' + JSON.stringify(response))
            return {
                TransformationJob: response.transformationJob,
            } as GetTransformResponse
        } catch (e: any) {
            const errorMessage = (e as Error).message ?? 'Error in GetTransformation API call'
            this.logging.log('Error: ' + errorMessage)

            return {
                TransformationJob: { status: 'FAILED' },
            } as GetTransformResponse
        }
    }
    async getTransformationPlan(request: GetTransformPlanRequest) {
        const getCodeTransformationPlanRequest = {
            transformationJobId: request.TransformationJobId,
        } as GetTransformationRequest
        this.logging.log('send request to get transform plan api: ' + JSON.stringify(getCodeTransformationPlanRequest))
        const response = await this.client.codeModernizerGetCodeTransformationPlan(getCodeTransformationPlanRequest)
        this.logging.log('received response from get transform plan api: ' + JSON.stringify(response))
        return {
            TransformationPlan: response.transformationPlan,
        } as GetTransformPlanResponse
    }

    async cancelTransformation(request: CancelTransformRequest) {
        try {
            const stopCodeTransformationRequest = {
                transformationJobId: request.TransformationJobId,
            } as StopTransformationRequest
            this.logging.log(
                'send request to cancel transform plan api: ' + JSON.stringify(stopCodeTransformationRequest)
            )
            const response = await this.client.codeModernizerStopCodeTransformation(stopCodeTransformationRequest)
            this.logging.log('received response from cancel transform plan api: ' + JSON.stringify(response))
            let status: CancellationJobStatus
            switch (response.transformationStatus) {
                case 'STOPPED':
                    status = CancellationJobStatus.SUCCESSFULLY_CANCELLED
                    break
                default:
                    status = CancellationJobStatus.FAILED_TO_CANCEL
                    break
            }
            return {
                TransformationJobStatus: status,
            } as CancelTransformResponse
        } catch (e: any) {
            const errorMessage = (e as Error).message ?? 'Error in CancelTransformation API call'
            this.logging.log('Error: ' + errorMessage)
            return {
                TransformationJobStatus: CancellationJobStatus.FAILED_TO_CANCEL,
            } as CancelTransformResponse
        }
    }

    async sleep(duration = 0): Promise<void> {
        return new Promise(r => setTimeout(r, Math.max(duration, 0)))
    }

    async pollTransformation(request: GetTransformRequest, validExitStatus: string[], failureStates: string[]) {
        let timer = 0

        const getCodeTransformationRequest = {
            transformationJobId: request.TransformationJobId,
        } as GetTransformationRequest
        this.logging.log('poll : send request to get transform  api: ' + JSON.stringify(getCodeTransformationRequest))
        let response = await this.client.codeModernizerGetCodeTransformation(getCodeTransformationRequest)
        this.logging.log('poll : received response from get transform  api: ' + JSON.stringify(response))
        let status = response?.transformationJob?.status ?? 'NOT_FOUND'

        this.logging.log('validExitStatus here are : ' + validExitStatus)
        this.logging.log('failureStatus here are : ' + failureStates)

        while (status != 'Timed_out' && !failureStates.includes(status)) {
            try {
                const apiStartTime = Date.now()

                const getCodeTransformationRequest = {
                    transformationJobId: request.TransformationJobId,
                } as GetTransformationRequest
                this.logging.log(
                    'poll : send request to get transform  api: ' + JSON.stringify(getCodeTransformationRequest)
                )
                response = await this.client.codeModernizerGetCodeTransformation(getCodeTransformationRequest)
                this.logging.log('poll : received response from get transform  api: ' + JSON.stringify(response))
                this.logging.log('poll : job status here : ' + response.transformationJob.status)

                if (response.transformationJob?.status) {
                    this.logging.log(
                        'status is included in validExitSTatus for poll ' +
                            validExitStatus.includes(response.transformationJob.status)
                    )
                }

                if (validExitStatus.includes(status)) {
                    this.logging.log('returning status as : ' + status)
                    break
                }

                status = response.transformationJob.status!
                await this.sleep(10 * 1000)
                timer += 10
                this.logging.log('current polling timer ' + timer)

                if (timer > 24 * 3600 * 1000) {
                    status = 'Timed_out'
                    break
                }
            } catch (e: any) {
                const errorMessage = (e as Error).message ?? 'Error in GetTransformation API call'
                this.logging.log('CodeTransformation: GetTransformation error = ' + errorMessage)
                status = 'FAILED'
                break
            }
        }
        this.logging.log('poll : returning response from server : ' + JSON.stringify(response))
        return {
            TransformationJob: response.transformationJob,
        } as GetTransformResponse
    }

    async downloadExportResultArchive(cwStreamingClient: CodeWhispererStreaming, exportId: string, saveToDir: string) {
        let result
        try {
            result = await cwStreamingClient.exportResultArchive({
                exportId,
                exportIntent: ExportIntent.TRANSFORMATION,
            })

            const buffer = []
            this.logging.log('artifact downloaded successfully.')

            if (result.body === undefined) {
                throw new Error('Empty response from CodeWhisperer Streaming service.')
            }

            for await (const chunk of result.body) {
                if (chunk.binaryPayloadEvent) {
                    const chunkData = chunk.binaryPayloadEvent
                    if (chunkData.bytes) {
                        buffer.push(chunkData.bytes)
                    }
                }
            }
            const pathContainingArchive = await this.archivePathGenerator(exportId, buffer, saveToDir)
            this.logging.log('pathContainingArchive :' + pathContainingArchive)
            return {
                PathTosave: pathContainingArchive,
            } as DownloadArtifactsResponse
        } catch (error) {
            const errorMessage = (error as Error).message ?? 'Failed to download the artifacts'
            return {
                Error: errorMessage,
            } as DownloadArtifactsResponse
        }
    }

    async archivePathGenerator(exportId: string, buffer: Uint8Array[], saveToDir: string) {
        const tempDir = path.join(saveToDir, exportId)
        const pathToArchive = path.join(tempDir, 'ExportResultsArchive.zip')
        await this.directoryExists(tempDir)
        await fs.writeFileSync(pathToArchive, Buffer.concat(buffer))
        let pathContainingArchive = ''
        pathContainingArchive = path.dirname(pathToArchive)
        const zip = new AdmZip(pathToArchive)
        zip.extractAllTo(pathContainingArchive)
        return pathContainingArchive
    }

    async directoryExists(directoryPath: any) {
        try {
            await fs.accessSync(directoryPath)
        } catch (error) {
            // Directory doesn't exist, create it
            await fs.mkdirSync(directoryPath, { recursive: true })
        }
    }

    getWorkspacePath(solutionRootPath: string): string {
        const randomPath = uuidv4().substring(0, 8)
        const workspacePath = path.join(solutionRootPath, workspaceFolderName, randomPath)
        if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true })
        }
        return workspacePath
    }
}
