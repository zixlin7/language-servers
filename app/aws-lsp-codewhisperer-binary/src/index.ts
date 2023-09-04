import { Server, standalone } from '@aws-placeholder/aws-language-server-runtimes/out/runtimes'
import { CodeWhispererServer } from '@lsp-placeholder/aws-lsp-codewhisperer'

const servers: Server[] = [CodeWhispererServer]
standalone(...servers)
