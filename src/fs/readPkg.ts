import path = require('path')
import {Package} from '../types'
import readPackageJsonCB = require('read-package-json')
import thenify = require('thenify')

const readPackageJson = thenify(readPackageJsonCB)

export default function readPkg (pkgPath: string): Promise<Package> {
  return readPackageJson(pkgPath)
}

export function fromDir (pkgPath: string): Promise<Package> {
  return readPkg(path.join(pkgPath, 'package.json'))
}
