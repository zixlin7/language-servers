/**
 * THIS FILE IS AUTOGENERATED BY 'generateServiceClient.ts'.
 * DO NOT EDIT BY HAND.
 */

import { Request } from 'aws-sdk/lib/request'
import { Response } from 'aws-sdk/lib/response'
import { AWSError } from 'aws-sdk/lib/error'
import { Service } from 'aws-sdk/lib/service'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { ConfigBase as Config } from 'aws-sdk/lib/config-base'
interface Blob {}
declare class CodeWhispererClient extends Service {
    /**
     * Constructs a service object. This object has one method for each API operation.
     */
    constructor(options?: CodeWhispererClient.Types.ClientConfiguration)
    config: Config & CodeWhispererClient.Types.ClientConfiguration
    /**
     *
     */
    generateCompletions(
        params: CodeWhispererClient.Types.GenerateCompletionsRequest,
        callback?: (err: AWSError, data: CodeWhispererClient.Types.GenerateCompletionsResponse) => void
    ): Request<CodeWhispererClient.Types.GenerateCompletionsResponse, AWSError>
    /**
     *
     */
    generateCompletions(
        callback?: (err: AWSError, data: CodeWhispererClient.Types.GenerateCompletionsResponse) => void
    ): Request<CodeWhispererClient.Types.GenerateCompletionsResponse, AWSError>
}
declare namespace CodeWhispererClient {
    export interface Completion {
        content: CompletionContentString
        references?: References
        mostRelevantMissingImports?: Imports
    }
    export type CompletionContentString = string
    export type Completions = Completion[]
    export interface FileContext {
        leftFileContent: FileContextLeftFileContentString
        rightFileContent: FileContextRightFileContentString
        filename: FileContextFilenameString
        programmingLanguage: ProgrammingLanguage
    }
    export type FileContextFilenameString = string
    export type FileContextLeftFileContentString = string
    export type FileContextRightFileContentString = string
    export interface GenerateCompletionsRequest {
        fileContext: FileContext
        maxResults?: GenerateCompletionsRequestMaxResultsInteger
        nextToken?: GenerateCompletionsRequestNextTokenString
        referenceTrackerConfiguration?: ReferenceTrackerConfiguration
    }
    export type GenerateCompletionsRequestMaxResultsInteger = number
    export type GenerateCompletionsRequestNextTokenString = string
    export interface GenerateCompletionsResponse {
        completions?: Completions
        nextToken?: String
    }
    export interface Import {
        statement?: ImportStatementString
    }
    export type ImportStatementString = string
    export type Imports = Import[]
    export interface ProgrammingLanguage {
        languageName: ProgrammingLanguageLanguageNameString
    }
    export type ProgrammingLanguageLanguageNameString = string
    export type RecommendationsWithReferencesPreference = 'BLOCK' | 'ALLOW' | string
    export interface Reference {
        licenseName?: ReferenceLicenseNameString
        repository?: ReferenceRepositoryString
        url?: ReferenceUrlString
        recommendationContentSpan?: Span
    }
    export type ReferenceLicenseNameString = string
    export type ReferenceRepositoryString = string
    export interface ReferenceTrackerConfiguration {
        recommendationsWithReferences: RecommendationsWithReferencesPreference
    }
    export type ReferenceUrlString = string
    export type References = Reference[]
    export interface Span {
        start?: SpanStartInteger
        end?: SpanEndInteger
    }
    export type SpanEndInteger = number
    export type SpanStartInteger = number
    export type String = string
    /**
     * A string in YYYY-MM-DD format that represents the latest possible API version that can be used in this service. Specify 'latest' to use the latest possible version.
     */
    export type apiVersion = '2022-06-15' | '2022-11-11' | 'latest' | string
    export interface ClientApiVersions {
        /**
         * A string in YYYY-MM-DD format that represents the latest possible API version that can be used in this service. Specify 'latest' to use the latest possible version.
         */
        apiVersion?: apiVersion
    }
    export type ClientConfiguration = ServiceConfigurationOptions & ClientApiVersions
    /**
     * Contains interfaces for use with the CodeWhispererClient client.
     */
    export import Types = CodeWhispererClient
}
export = CodeWhispererClient
