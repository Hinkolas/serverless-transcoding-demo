export type TranscodePreset = {
	label: string;
	height: number;
	videoBitrate: string;
	maxrate: string;
	bufsize: string;
	codec: 'h264';
	audioBitrate: string;
};

export const transcodePresets: TranscodePreset[] = [
	{
		label: '480p',
		height: 480,
		videoBitrate: '1400k',
		maxrate: '1498k',
		bufsize: '2100k',
		codec: 'h264',
		audioBitrate: '128k'
	},
	{
		label: '720p',
		height: 720,
		videoBitrate: '2800k',
		maxrate: '2996k',
		bufsize: '4200k',
		codec: 'h264',
		audioBitrate: '128k'
	},
	{
		label: '1080p',
		height: 1080,
		videoBitrate: '5000k',
		maxrate: '5350k',
		bufsize: '7500k',
		codec: 'h264',
		audioBitrate: '192k'
	}
];

export const segmentSeconds = 6;
