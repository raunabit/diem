/*
Used purely for debugging purposes
Could be used later in previewing the job
*/

import { utils } from '@common/utils';
import { DataModel, ECodeLanguage, IJobSchema } from '@models';
import { IError, IRequest } from '@interfaces';
import { addTrace, base64decode } from '@functions';
import { INodePyJob } from './np.interfaces';
import { pythonServicesHandler } from './python/python.services.handler';
import { javascriptServicesHandler } from './javascript/javascript.services.handler';

export interface IServices {
    email: string;
    id: string;
    jobid?: string;
    serviceid?: string;
    token: string;
    transid: string;
    params?: any;
}

export const prepareNodePyServicesJob: (body: IServices) => Promise<INodePyJob> = async (
    body: IServices
): Promise<INodePyJob> => {
    if (!body.serviceid) {
        return Promise.reject({
            message: 'no id provided',
            trace: ['@at $nodepy.services.pyfile (prepareNodePyServicesJob) - nodid'],
        });
    }

    const id: string = body.id;

    // a job can be called via url or via body
    const serviceid: string = body.serviceid;
    const params: any = body.params || {};

    const doc: IJobSchema | null = await DataModel.findOne({ _id: serviceid })
        .lean()
        .exec()
        .catch(async (err: any) => {
            err.trace = addTrace(err.trace, '@at $nodepy.services.pyfile (prepareNodePyServicesJob) - findOne');
            err.serviceid = serviceid;

            return Promise.reject(err);
        });

    if (doc === null) {
        return Promise.reject({
            message: `doc ${serviceid} not found`,
            serviceid,
            trace: ['@at $nodepy.services.pyfile (prepareNodePyServicesJob) - null document'],
        });
    }

    doc.job.serviceid = body.serviceid;
    doc.job.jobid = body.jobid || id;
    doc.annotations.transid = body.transid;
    doc.job.email = body.email;
    doc.job.params = { ...doc.job.params, ...params };

    let nodepyJob: INodePyJob;

    if (doc.custom?.executor === ECodeLanguage.javascript) {
        nodepyJob = await javascriptServicesHandler(doc).catch(async (err: any) => {
            err.trace = addTrace(err.trace, '@at $nodepy.file (createNodePyJob) - javascriptHandler');

            return Promise.reject(err);
        });

        nodepyJob.language = ECodeLanguage.javascript;
    } else {
        nodepyJob = await pythonServicesHandler(doc).catch(async (err: IError) => {
            err.trace = addTrace(err.trace, '@at $nodepyjob (createNodePyJob) - pythonHandler');

            return Promise.reject(err);
        });

        nodepyJob.language = ECodeLanguage.python;
    }

    if (!nodepyJob) {
        return Promise.reject({
            message: 'no file could be prepared',
            trace: ['@at $nodepy.file (prepareNodePyJob)'],
        });
    }

    utils.logInfo(
        `$nodepy.services.pyfile (prepareNodePyServicesJob): file prepared - doc: ${id} - ti: ${body.transid}`
    );

    return Promise.resolve(nodepyJob);
};

export const npcodefileservices: (req: IRequest) => Promise<string> = async (req: IRequest): Promise<string> => {
    if (req.query.id === null) {
        return Promise.resolve('');
    }

    if (req.user.role !== 'admin') {
        return Promise.resolve('You need to be Admin to view this file');
    }

    const id: string =
        req.params && req.params.pyfile ? req.params.pyfile.split('.')[0] : req.body ? req.body.id : undefined;

    if (!id) {
        return Promise.reject({
            message: 'doc not found',
            trace: ['@at $nodepy.file (npcodefileservices) - nodid'],
        });
    }

    const body = {
        id,
        serviceid: id,
        transid: req.transid,
        email: req.user.email,
        token: '',
    };

    const nodepyJob: INodePyJob = await prepareNodePyServicesJob(body).catch(async (err: any) => {
        err.trace = addTrace(err.trace, '@at $nodepy.file (npcodefile) - prepareNodePyJob');

        return Promise.reject(err);
    });

    utils.logInfo(`$nodepy.file (npcodefile): file prepared - doc: ${id} - transid: ${req.transid}`);

    return Promise.resolve(base64decode(nodepyJob.code));
};