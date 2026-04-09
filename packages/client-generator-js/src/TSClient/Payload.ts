import { uncapitalize } from '@prisma/client-common'
import * as DMMF from '@prisma/dmmf'
import * as ts from '@prisma/ts-builders'

import { addExtArgsParameterIfNeeded, getPayloadName } from '../utils'
import { GenerateContext } from './GenerateContext'
import { buildModelOutputProperty } from './Output'

export function buildTypesForModelFieldsByType(model: DMMF.Model, context: GenerateContext) {
  const objects = ts.objectType()
  const composites = ts.objectType()
  const scalars = ts.objectType()

  for (const field of model.fields) {
    if (field.kind === 'object') {
      if (context.dmmf.isComposite(field.type)) {
        composites.add(buildModelOutputProperty(field, context.dmmf, context))
      } else {
        objects.add(buildModelOutputProperty(field, context.dmmf, context))
      }
    } else if (field.kind === 'enum' || field.kind === 'scalar') {
      scalars.add(buildModelOutputProperty(field, context.dmmf, context))
    }
  }
  return { objects, composites, scalars }
}

export function buildModelPayload(model: DMMF.Model, context: GenerateContext) {
  const isComposite = context.dmmf.isComposite(model.name)
  const { objects, composites, scalars } = buildTypesForModelFieldsByType(model, context)

  // disableTypingSupportForHeavyFeatures inverts where the simple scalars are stored.
  // Normally, the scalars originate in the model payload.
  // When simplified they originate in the <Model> type outside of the Prisma namespace. (to ease the load for the language-service and to be able to even split up the file in the future)
  const scalarsType = !context.isTypingSupportForHeavyFeaturesEnabled()
    ? ts.namedType(model.name)
    : isComposite
      ? scalars
      : ts
          .namedType('$Extensions.GetPayloadResult')
          .addGenericArgument(scalars)
          .addGenericArgument(ts.namedType('ExtArgs').subKey('result').subKey(uncapitalize(model.name)))

  const payloadType = ts
    .objectType()
    .add(ts.property('name', ts.stringLiteral(model.name)))
    .add(ts.property('objects', objects))
    .add(ts.property('scalars', scalarsType))
  if (context.isTypingSupportForHeavyFeaturesEnabled()) {
    payloadType.add(ts.property('composites', composites))
  }
  const payloadTypeDeclaration = ts.typeDeclaration(getPayloadName(model.name, false), payloadType)

  if (!isComposite) {
    addExtArgsParameterIfNeeded(payloadTypeDeclaration, context)
  }

  return ts.moduleExport(payloadTypeDeclaration)
}
