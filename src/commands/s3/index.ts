import { Command } from 'commander'
import { handleError } from '../../lib/errors.ts'

export function createS3Command (): Command {
  const s3Cmd = new Command('s3')
    .description('Future S3 placeholder outside the v1 release surface')

  // Future, non-v1 placeholder. Do not register this command until the S3 API
  // integration is implemented and ready for release.
  // - upload
  // - download
  // - list
  // - delete
  // - sync
  // - bucket (create/list/delete)

  s3Cmd
    .command('upload')
    .description('Upload files to S3')
    .argument('<source>', 'Source file or directory')
    .argument('[destination]', 'Destination path')
    .option('--bucket <bucket>', 'Bucket name')
    .option('--acl <acl>', 'Access control: private, public-read')
    .action(async (source, destination, options) => {
      try {
        console.log('S3 commands are not part of the v1 release surface yet.', { source, destination, options })
      } catch (error) {
        handleError(error)
      }
    })

  // This file is kept as a marker for future S3 work only.

  return s3Cmd
}
