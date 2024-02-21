import { AwsLanguageService, MutuallyExclusiveLanguageService, UriResolver } from '@aws/lsp-core'
import { JsonLanguageService } from '@aws/lsp-json-common'
import { YamlLanguageService } from '@aws/lsp-yaml-common'

export type CloudFormationServiceProps = {
    displayName: string
    defaultSchemaUri: string
    uriResolver: UriResolver
}

export function create(props: CloudFormationServiceProps): AwsLanguageService {
    const jsonService = new JsonLanguageService(props)
    const yamlService = new YamlLanguageService(props)

    return new MutuallyExclusiveLanguageService([jsonService, yamlService])
}
