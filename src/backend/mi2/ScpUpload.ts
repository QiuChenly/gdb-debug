import * as fs from "fs"
import * as path from "path"
import { SCPEntry } from "../backend";
import { SFTPWrapper, TransferOptions } from "ssh2";

export function isDirectory(path: string) {
	return fs.existsSync(path) && fs.statSync(path).isDirectory();
}

export function isFile(path: string) {
	return fs.existsSync(path) && fs.statSync(path).isFile();
}

export const creatFolderRemote = (ftp: SFTPWrapper, remoteLink: string) => {
	return new Promise(async (resolve, reject) => {
		const isExist = await new Promise<boolean>((resolve, reject) => {
			console.log("stdout", "fileLink " + remoteLink)
			ftp.exists(remoteLink, (error) => {
				console.log("stdout", "是否存在 " + remoteLink + " " + error)
				resolve(error);
			})
		})

		if (!isExist) {
			console.log("stdout", "准备创建远程文件夹 " + remoteLink)
			ftp.mkdir(remoteLink, (err) => {
				if (err) {
					resolve(err.message);
					console.log("stderr", "err " + err.message);
				}
				else {
					resolve("创建目录成功。");
					console.log("stderr", "创建目录成功  " + remoteLink);
				}
			})
		} else {
			resolve("目录已经存在。");
		}
	});
}

export const recurseUpload = async (sftp: SFTPWrapper, fileObj: SCPEntry) => {
	let list = getFolderContentsSync(fileObj.local);
	console.log("stdout", "读取到的列表:" + list);

	for (const file of list) {
		const fileLink = path.join(fileObj.local, file);
		const remoteLink = path.join(fileObj.remote, file);
		if (isFile(fileLink)) {
			const res = await uploadFile2SSH(sftp, {
				local: fileLink,
				remote: remoteLink
			} as SCPEntry);
			console.log("stdout", "当前为文件: " + fileLink + "\n" + res);
		} else {
			console.log("stdout", "当前为目录: " + fileLink + " remoteLink = " + remoteLink);
			await creatFolderRemote(sftp, remoteLink);
			console.log("stderr", "创建目录结束  " + remoteLink);

			await recurseUpload(sftp, {
				local: fileLink,
				remote: remoteLink
			} as SCPEntry)
		}
	}
}

export function uploadFile2SSH(sftp: SFTPWrapper, fileObj: SCPEntry) {
	return new Promise((resolve, reject) => {
		sftp.fastPut(fileObj.local, fileObj.remote, {
		} as TransferOptions, (err) => {
			if (err) {
				resolve(`上传 ${fileObj.local} -> ${fileObj.remote} 失败: ${err.message}`);
			} else {
				resolve(`上传成功: ${fileObj.local} -> ${fileObj.remote}`);
			}
		});
	});
}

export function uploadFileWithPermissions(
	sftp: SFTPWrapper,
	fileObj: SCPEntry
): Promise<string> {
	return new Promise((resolve, reject) => {
		// 获取本地文件权限
		fs.stat(fileObj.local, (err, stats) => {
			if (err) {
				return reject(`无法获取本地文件权限: ${err.message}`);
			}
			const mode = stats.mode & 0o777; // 仅获取文件权限部分（忽略其他信息）

			// 先上传文件
			sftp.fastPut(fileObj.local, fileObj.remote, (err) => {
				if (err) {
					return reject(`上传失败: ${err.message}`);
				}

				// 上传成功后，设置远程文件权限
				sftp.chmod(fileObj.remote, mode, (err) => {
					if (err) {
						return reject(`修改远程文件权限失败: ${err.message}`);
					}
					resolve(`上传成功，并保持文件权限: ${fileObj.local} -> ${fileObj.remote} (权限: ${mode.toString(8)})`);
				});
			});
		});
	});
}

export function getFolderContentsSync(folderPath: string): string[] {
	if (!fs.existsSync(folderPath)) {
		throw new Error(`路径不存在: ${folderPath}`);
	}
	return fs.readdirSync(folderPath);
}
