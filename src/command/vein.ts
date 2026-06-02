#!/usr/bin/env bun
import { Command } from 'commander'
import { register as registerAsk } from './ask.command'
import { register as registerConfig } from './config.command'
import { register as registerHistory } from './history.command'
import { register as registerMarkdown } from './markdown.command'
import { register as registerNew } from './new.command'
import { register as registerTags } from './tags.command'

const vein = new Command()
    .name('vein')
    .description('AI-powered document management')

registerNew(vein)
registerMarkdown(vein)
registerAsk(vein)
registerHistory(vein)
registerTags(vein)
registerConfig(vein)

vein.parse()
