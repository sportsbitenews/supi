import rimraf = require('rimraf-then')
import path = require('path')
import getContext, {PnpmContext} from './getContext'
import getSaveType from '../getSaveType'
import removeDeps from '../removeDeps'
import extendOptions from './extendOptions'
import {PnpmOptions, StrictPnpmOptions, Package} from '../types'
import lock from './lock'
import {
  Shrinkwrap,
  write as saveShrinkwrap,
  prune as pruneShrinkwrap,
} from 'pnpm-shrinkwrap'
import logger, {streamParser} from 'pnpm-logger'
import {
  save as saveModules,
  LAYOUT_VERSION,
} from '../fs/modulesController'
import removeOrphanPkgs from './removeOrphanPkgs'
import {PackageSpec} from 'package-store'
import safeIsInnerLink from '../safeIsInnerLink'
import removeTopDependency from '../removeTopDependency'
import shrinkwrapsEqual from './shrinkwrapsEqual'

export default async function uninstall (pkgsToUninstall: string[], maybeOpts?: PnpmOptions) {
  const reporter = maybeOpts && maybeOpts.reporter
  if (reporter) {
    streamParser.on('data', reporter)
  }

  const opts = extendOptions(maybeOpts)

  if (opts.lock) {
    await lock(opts.prefix, _uninstall, {stale: opts.lockStaleDuration, locks: opts.locks})
  } else {
    await _uninstall()
  }

  if (reporter) {
    streamParser.removeListener('data', reporter)
  }

  async function _uninstall () {
    const ctx = await getContext(opts)

    if (!ctx.pkg) {
      throw new Error('No package.json found - cannot uninstall')
    }

    if (opts.lock === false) {
      return run()
    }

    return lock(ctx.storePath, run, {stale: opts.lockStaleDuration, locks: opts.locks})

    function run () {
      return uninstallInContext(pkgsToUninstall, ctx, opts)
    }
  }
}

export async function uninstallInContext (pkgsToUninstall: string[], ctx: PnpmContext, opts: StrictPnpmOptions) {
  const makePartialPrivateShrinkwrap = !shrinkwrapsEqual(ctx.privateShrinkwrap, ctx.shrinkwrap)

  const pkgJsonPath = path.join(ctx.root, 'package.json')
  const saveType = getSaveType(opts)
  const pkg = await removeDeps(pkgJsonPath, pkgsToUninstall, saveType)
  const newShr = pruneShrinkwrap(ctx.shrinkwrap, pkg)
  const removedPkgIds = await removeOrphanPkgs({
    oldShrinkwrap: ctx.privateShrinkwrap,
    newShrinkwrap: newShr,
    prefix: ctx.root,
    store: ctx.storePath,
    storeIndex: ctx.storeIndex,
    bin: opts.bin,
  })
  const privateShrinkwrap = makePartialPrivateShrinkwrap
    ? pruneShrinkwrap(ctx.privateShrinkwrap, pkg)
    : newShr
  await saveShrinkwrap(ctx.root, newShr, privateShrinkwrap)
  await saveModules(path.join(ctx.root, 'node_modules'), {
    packageManager: `${opts.packageManager.name}@${opts.packageManager.version}`,
    store: ctx.storePath,
    skipped: Array.from(ctx.skipped).filter(pkgId => removedPkgIds.indexOf(pkgId) === -1),
    layoutVersion: LAYOUT_VERSION,
    independentLeaves: opts.independentLeaves,
  })
  await removeOuterLinks(pkgsToUninstall, path.join(ctx.root, 'node_modules'), {
    storePath: ctx.storePath,
    bin: opts.bin,
  })

  logger('summary').info()
}

async function removeOuterLinks (
  pkgsToUninstall: string[],
  modules: string,
  opts: {
    storePath: string,
    bin: string,
  }
) {
  // These packages are not in package.json, they were just linked in not installed
  for (const pkgToUninstall of pkgsToUninstall) {
    if (!await safeIsInnerLink(modules, pkgToUninstall, opts)) {
      await removeTopDependency({
        name: pkgToUninstall,
        dev: false,
        optional: false,
      }, {
        modules,
        bin: opts.bin,
      })
    }
  }
}
